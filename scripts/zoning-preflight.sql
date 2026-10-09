-- Zoning migration PREFLIGHT. Read-only. Run BEFORE applying 202610080001_zoning_info.sql:
--   PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f scripts/zoning-preflight.sql
-- Use the operator's verified direct/unpooled libpq connection configuration (see neon/README.md).
-- Any STOP row => do not migrate. REVIEW rows need a human decision. Run again after a failed
-- migration to prove nothing changed. Save the output with the restore-point record.
-- Result 1: PASS/STOP/REVIEW/INFO table. Result 2: catalog snapshot (JSON) for the record.
WITH
cols AS (SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'),
req(tbl, col) AS (VALUES
  ('lands','slug'),('lands','zoning'),('lands','verification_status'),('lands','updated_at'),('lands','deleted_at'),
  ('lands','status'),('property_submissions','zoning'),('property_submissions','verification_status'),
  ('property_submissions','linked_land_id')),
missing AS (SELECT r.tbl || '.' || r.col AS name FROM req r
  LEFT JOIN cols c ON c.table_name = r.tbl AND c.column_name = r.col WHERE c.column_name IS NULL),
rerun AS (SELECT string_agg(table_name || '.zoning_info', ', ' ORDER BY table_name) AS found
  FROM cols WHERE column_name = 'zoning_info' AND table_name IN ('lands','property_submissions')),
legacy AS (
  SELECT 'lands' AS tbl, count(*) FILTER (WHERE zoning IS NOT NULL) AS total,
    count(*) FILTER (WHERE zoning IS NOT NULL AND zoning::text NOT IN ('purple','purple_light','brown','orange','yellow','green','other')) AS bad
  FROM public.lands
  UNION ALL
  SELECT 'property_submissions', count(*) FILTER (WHERE zoning IS NOT NULL),
    count(*) FILTER (WHERE zoning IS NOT NULL AND zoning::text NOT IN ('purple','purple_light','brown','orange','yellow','green','other'))
  FROM public.property_submissions),
kb AS (SELECT count(*) AS n,
    count(*) FILTER (WHERE zoning IS NULL AND coalesce(to_jsonb(l)->'zoning_info', 'null'::jsonb) = 'null'::jsonb) AS clean,
    count(*) FILTER (WHERE to_jsonb(l)->'zoning_info'->>'status' = 'owner_reported'
      AND to_jsonb(l)->'zoning_info'#>>'{zones,0,color}' = 'green' AND zoning::text = 'green') AS corrected,
    count(*) FILTER (WHERE to_jsonb(l)->'zoning_info' IS NOT NULL AND to_jsonb(l)->'zoning_info' <> 'null'::jsonb) AS has_info,
    max(zoning::text) AS legacy_zoning, max(verification_status) AS vstatus
  FROM public.lands l WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL),
objs AS (
  SELECT 'function ' || p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('valid_zoning_info','sync_land_zoning_info')
  UNION ALL SELECT 'trigger ' || t.tgname || ' on ' || c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal
    AND t.tgname = 'sync_land_zoning_info'
  UNION ALL SELECT 'constraint ' || con.conname || ' on ' || c.relname FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    AND con.conname IN ('lands_zoning_info_valid','submissions_zoning_info_valid')),
other_trg AS (SELECT count(*) AS n, string_agg(c.relname || '.' || t.tgname, ', ') AS names
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname IN ('lands','property_submissions')
    AND t.tgname <> 'sync_land_zoning_info'),
busy AS (
  SELECT a.pid, a.state, now() - a.xact_start AS age, left(a.query, 60) AS q
  FROM pg_stat_activity a
  WHERE a.pid <> pg_backend_pid() AND a.xact_start IS NOT NULL AND now() - a.xact_start > interval '30 seconds'
    AND EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.relation IN
      ('public.lands'::regclass, 'public.property_submissions'::regclass))),
own AS (SELECT string_agg(c.relname, ', ') AS notowned FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('lands','property_submissions')
    AND NOT pg_has_role(current_user, c.relowner, 'USAGE'))
SELECT 1 AS ord, 'session is read-only' AS "check",
  CASE WHEN current_setting('default_transaction_read_only') = 'on' THEN 'PASS' ELSE 'STOP' END AS result,
  'default_transaction_read_only=' || current_setting('default_transaction_read_only') || ' db=' || current_database()
  || ' pg=' || current_setting('server_version') AS detail
UNION ALL SELECT 2, 'required tables/columns exist',
  CASE WHEN (SELECT count(*) FROM missing) = 0 THEN 'PASS' ELSE 'STOP' END,
  coalesce((SELECT 'missing: ' || string_agg(name, ', ') FROM missing), 'all ' || (SELECT count(*) FROM req) || ' present')
UNION ALL SELECT 3, 'zoning_info already present (re-run detection)',
  CASE WHEN (SELECT found FROM rerun) IS NULL THEN 'PASS' ELSE 'REVIEW' END,
  coalesce('already exists: ' || (SELECT found FROM rerun) || ' - migration applied (fully or partly); run postflight instead of re-applying blindly', 'not present: first run')
UNION ALL SELECT 10 + row_number() OVER (ORDER BY tbl), 'legacy ' || tbl || '.zoning values outside allowed set',
  CASE WHEN bad = 0 THEN 'PASS' ELSE 'STOP' END, bad || ' invalid of ' || total || ' non-null'
  FROM legacy
UNION ALL SELECT 20, 'Kabin Buri (101-rai-kabin-buri) state',
  CASE WHEN n <> 1 THEN 'STOP' WHEN corrected = 1 OR clean = 1 THEN 'PASS' WHEN has_info = 1 THEN 'REVIEW' ELSE 'STOP' END,
  CASE WHEN n <> 1 THEN n || ' live rows with this slug (expected 1)'
       WHEN corrected = 1 THEN 'already corrected (green/owner_reported)'
       WHEN clean = 1 THEN 'no zoning facts: will be corrected to green/owner_reported; verification_status ' || vstatus || ' -> pending'
       WHEN has_info = 1 THEN 'has a different zoning_info (admin-reviewed?): migration skips the correction with a NOTICE; confirm intended'
       ELSE 'legacy zoning=' || coalesce(legacy_zoning, 'null') || ' without zoning_info: migration will abort; reconcile first' END
  FROM kb
UNION ALL SELECT 30, 'zoning function/trigger/constraint names free',
  CASE WHEN (SELECT count(*) FROM objs) = 0 THEN 'PASS' WHEN (SELECT found FROM rerun) IS NOT NULL THEN 'REVIEW' ELSE 'STOP' END,
  coalesce((SELECT string_agg(name, '; ') FROM objs), 'none exist')
UNION ALL SELECT 31, 'other triggers on lands/property_submissions',
  CASE WHEN n = 0 THEN 'PASS' ELSE 'REVIEW' END, CASE WHEN n = 0 THEN 'none' ELSE names END FROM other_trg
UNION ALL SELECT 40, 'transactions >30s holding locks on lands/property_submissions',
  CASE WHEN (SELECT count(*) FROM busy) = 0 THEN 'PASS' ELSE 'STOP' END,
  coalesce((SELECT string_agg('pid ' || pid || ' ' || state || ' age ' || age::text || ' ' || q, '; ') FROM busy), 'none (visibility limited to your role)')
UNION ALL SELECT 41, 'current user owns lands and property_submissions',
  CASE WHEN notowned IS NULL THEN 'PASS' ELSE 'STOP' END, coalesce('not owner of: ' || notowned, 'ok') FROM own
UNION ALL SELECT 50, 'row counts (compare with postflight)', 'INFO',
  'lands=' || (SELECT count(*) FROM public.lands) || ' live=' || (SELECT count(*) FROM public.lands WHERE deleted_at IS NULL)
  || ' legacy_zoning_lands=' || (SELECT total FROM legacy WHERE tbl = 'lands')
  || ' submissions=' || (SELECT count(*) FROM public.property_submissions)
  || ' legacy_zoning_submissions=' || (SELECT total FROM legacy WHERE tbl = 'property_submissions')
UNION ALL SELECT 51, 'lands verification (compare with postflight)', 'INFO',
  'verified=' || (SELECT count(*) FROM public.lands WHERE verification_status = 'verified')
  || ' pending=' || (SELECT count(*) FROM public.lands WHERE verification_status = 'pending')
ORDER BY ord;

-- Catalog snapshot for the record (not a pass/fail check).
SELECT jsonb_build_object(
  'database', current_database(), 'server_version', current_setting('server_version'),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('table', rel.relname, 'name', con.conname,
    'type', con.contype, 'definition', pg_get_constraintdef(con.oid)) ORDER BY rel.relname, con.conname)
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public'),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('table', rel.relname, 'definition', pg_get_triggerdef(t.oid),
    'function', pg_get_functiondef(t.tgfoid))) FROM pg_trigger t JOIN pg_class rel ON rel.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE ns.nspname='public' AND NOT t.tgisinternal),
  'lands', (SELECT jsonb_agg(jsonb_build_object('slug',l.slug,'status',l.status,'zoning',l.zoning,
    'verification_status',l.verification_status,'deleted',l.deleted_at IS NOT NULL,
    'zoning_info',to_jsonb(l)->'zoning_info') ORDER BY l.slug) FROM public.lands l),
  'submissions', (SELECT jsonb_agg(jsonb_build_object('status',s.status,'verification_status',s.verification_status,
    'zoning_info_present',coalesce(to_jsonb(s)->'zoning_info', 'null'::jsonb) <> 'null'::jsonb)) FROM public.property_submissions s)
) AS zoning_catalog_snapshot;
