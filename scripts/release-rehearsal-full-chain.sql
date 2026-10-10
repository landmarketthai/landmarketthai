\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY (never Neon production or a shared UAT branch).
-- Prereq: empty DB with supabase/schema.sql, supabase/migrations/*.sql and db/migrations/*.sql applied in order
-- (see docs/release/LANDMARKETTHAI_UAT_CLOSURE_20261010.md). Run from scripts/: psql -X -f release-rehearsal-full-chain.sql
-- Rehearses on the full app schema: zoning preflight -> migrate -> postflight -> rerun -> rollback x2 -> reapply,
-- plus the rate-limit migration rerun, grants and app-role behaviour. Synthetic rows only.

INSERT INTO public.lands (title_th, slug, province_id, land_type, status, verification_status, zoning, size_rai)
SELECT v.t, v.s, p.id, v.lt::land_type_enum, 'active', v.vs, v.z::zoning_enum, v.r
FROM (VALUES
  ('ที่ดิน 101 ไร่ กบินทร์บุรี', '101-rai-kabin-buri', 'ปราจีนบุรี', 'industrial', 'verified', NULL, 101),
  ('ที่ดิน 37 ไร่ EEC ระยอง', '37-rai-eec-rayong', 'ระยอง', 'eec', 'verified', 'purple', 37),
  ('synthetic pending', 'synthetic-pending', 'ระยอง', 'land', 'pending', NULL, 5)
) v(t, s, prov, lt, vs, z, r) JOIN public.provinces p ON p.name_th = v.prov;
INSERT INTO public.property_submissions (zoning, status) VALUES ('green', 'draft'), (NULL, 'draft');

-- Full-row fingerprint of everything except Kabin and the new column.
CREATE TEMP VIEW fp AS SELECT
  (SELECT md5(string_agg((to_jsonb(l) - 'zoning_info')::text, '|' ORDER BY id)) FROM public.lands l WHERE slug <> '101-rai-kabin-buri') AS other_lands,
  (SELECT md5(string_agg((to_jsonb(s) - 'zoning_info')::text, '|' ORDER BY id)) FROM public.property_submissions s) AS subs,
  (SELECT md5(to_jsonb(l)::text) FROM public.lands l WHERE slug = '101-rai-kabin-buri') AS kabin_full;
CREATE TEMP TABLE fp0 AS SELECT * FROM fp;

\echo '== 1. preflight (read-only session)'
SET default_transaction_read_only = on;
\ir zoning-preflight.sql
RESET default_transaction_read_only;
SELECT count(*) = 0 AS no_zoning_info_column FROM information_schema.columns WHERE column_name = 'zoning_info' \gset
\if :no_zoning_info_column
\else
  \echo 'FAIL: zoning_info exists before migration'
  SELECT 1/0;
\endif

\echo '== 2. migrate'
\ir ../neon/migrations/202610080001_zoning_info.sql
\ir zoning-postflight.sql
DO $t$ BEGIN
  ASSERT (SELECT zoning::text = 'green' AND zoning_info->>'status' = 'owner_reported' AND verification_status = 'pending'
          FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'Kabin must be green/owner_reported/pending';
  ASSERT (SELECT other_lands = (SELECT other_lands FROM fp0) AND subs = (SELECT subs FROM fp0) FROM fp), 'unrelated rows changed';
END $t$;
CREATE TEMP TABLE fp1 AS SELECT * FROM fp;

\echo '== 3. rerun migration (idempotent)'
\ir ../neon/migrations/202610080001_zoning_info.sql
DO $t$ BEGIN ASSERT (SELECT row(f.*) = row(g.*) FROM fp f, fp1 g), 'rerun changed data'; END $t$;

\echo '== 4. LZ409 on lossy legacy edit, then rollback twice, then reapply'
DO $t$ BEGIN
  BEGIN
    UPDATE public.lands SET zoning = 'yellow' WHERE slug = '101-rai-kabin-buri';
    RAISE EXCEPTION 'lossy legacy edit was accepted';
  EXCEPTION WHEN SQLSTATE 'LZ409' THEN NULL;
  END;
END $t$;
\ir zoning-rollback.sql
\ir zoning-rollback.sql
DO $t$ BEGIN
  ASSERT (SELECT row(f.*) = row(g.*) FROM fp f, fp1 g), 'rollback changed data';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_land_zoning_info'), 'trigger left after rollback';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lands' AND column_name = 'zoning_info'), 'rollback dropped data column';
END $t$;
\ir ../neon/migrations/202610080001_zoning_info.sql
DO $t$ BEGIN
  ASSERT (SELECT row(f.*) = row(g.*) FROM fp f, fp1 g), 'reapply changed data';
  ASSERT (SELECT count(*) = 2 FROM pg_trigger WHERE tgname = 'sync_land_zoning_info'), 'triggers not restored';
END $t$;

\echo '== 5. rate-limit migration rerun, grants, behaviour'
\ir ../db/migrations/20261009_public_write_rate_limits.sql
DO $t$ DECLARE c text := repeat('a', 64); d text := repeat('b', 64); BEGIN
  ASSERT NOT has_table_privilege('anon', 'public_write_rate_limits', 'SELECT'), 'anon can read limiter';
  ASSERT NOT has_function_privilege('anonymous', 'consume_rate_limit(text,text,int,int,int)', 'EXECUTE'), 'anonymous can execute limiter';
  ASSERT NOT has_function_privilege('authenticated', 'consume_rate_limit(text,text,int,int,int)', 'EXECUTE'), 'authenticated can execute limiter';
  ASSERT consume_rate_limit('rehearsal', c, 2, 3, 60) = 0;
  ASSERT consume_rate_limit('rehearsal', c, 2, 3, 60) = 0;
  ASSERT consume_rate_limit('rehearsal', c, 2, 3, 60) > 0, 'client limit not enforced';
  ASSERT (SELECT request_count = 2 FROM public_write_rate_limits WHERE bucket = 'rehearsal' AND client_hash = '*'),
    'denied client must not burn global quota';
  ASSERT consume_rate_limit('rehearsal', d, 2, 3, 60) = 0;
  ASSERT consume_rate_limit('rehearsal', d, 2, 3, 60) > 0, 'global limit not enforced';
  ASSERT consume_rate_limit('Bad-Bucket', c, 2, 3, 60) > 0, 'invalid bucket must deny';
  DELETE FROM public_write_rate_limits WHERE bucket = 'rehearsal';
END $t$;

-- A role that does not own the table (e.g. a separate app role) cannot use the limiter: the app then
-- silently falls back to the per-instance limiter. Apply the migration AS the app's DATABASE_URL role.
CREATE ROLE rehearsal_app_role;
SET ROLE rehearsal_app_role;
DO $t$ BEGIN
  PERFORM consume_rate_limit('rehearsal', repeat('c', 64), 2, 3, 60);
  RAISE EXCEPTION 'non-owner role unexpectedly allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'non-owner role denied as expected (owner gate)';
END $t$;
RESET ROLE;
DROP ROLE rehearsal_app_role;

SELECT 'Full-chain release rehearsal passed' AS result;
