-- Zoning migration POSTFLIGHT. Read-only. Run right after the migration, BEFORE deploying the app:
--   PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -f scripts/zoning-postflight.sql
-- Use the operator's verified direct/unpooled libpq connection configuration (see neon/README.md).
-- FAIL => go to the recovery matrix in neon/README.md. REVIEW => human decision. INFO => compare with preflight.
-- Count expectations use the SAVED preflight state, never a +0/+1 tolerance:
-- lands, live, submissions, legacy_zoning_submissions: unchanged.
-- legacy_zoning_lands: exactly +1 only if this run corrects the one live Kabin Buri
-- from zoning NULL AND zoning_info NULL; exactly +0 if it already has zoning_info
-- (including a previous correction or admin-reviewed data, even with no color).
-- Compare all other lands with the preflight catalog snapshot: offsetting unrelated
-- changes can leave the global count correct and must not be accepted.
WITH
colchk(tbl, col) AS (VALUES ('lands','zoning_info'),('property_submissions','zoning_info')),
colres AS (SELECT c.tbl || '.' || c.col AS name, i.data_type FROM colchk c
  LEFT JOIN information_schema.columns i ON i.table_schema = 'public' AND i.table_name = c.tbl AND i.column_name = c.col),
cons AS (SELECT c.relname AS tbl, con.conname, con.convalidated, pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND con.contype = 'c' AND con.conname IN ('lands_zoning_info_valid','submissions_zoning_info_valid')),
expc(tbl, conname) AS (VALUES ('lands','lands_zoning_info_valid'),('property_submissions','submissions_zoning_info_valid')),
trg AS (SELECT c.relname AS tbl, t.tgenabled, t.tgtype FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname = 'sync_land_zoning_info'),
fn AS (SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('valid_zoning_info','sync_land_zoning_info')),
bad AS (
  SELECT (SELECT count(*) FROM public.lands WHERE NOT public.valid_zoning_info(zoning_info)) AS lands_bad,
         (SELECT count(*) FROM public.property_submissions WHERE NOT public.valid_zoning_info(zoning_info)) AS subs_bad),
kb AS (SELECT count(*) AS n,
    count(*) FILTER (WHERE zoning_info->>'status' = 'owner_reported' AND zoning_info#>>'{zones,0,color}' = 'green'
      AND zoning = 'green' AND jsonb_array_length(zoning_info->'zones') = 1) AS ok,
    max(verification_status) AS vstatus
  FROM public.lands WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL),
pub AS (SELECT count(*) AS n FROM public.lands
  WHERE deleted_at IS NULL AND status = 'active' AND zoning_info->>'status' = 'owner_reported'
    AND (coalesce(zoning_info->>'source', '') <> '' OR coalesce(zoning_info->>'evidence_url', '') <> ''))
SELECT 1 AS ord, 'zoning_info columns exist (jsonb)' AS "check",
  CASE WHEN (SELECT count(*) FROM colres WHERE data_type = 'jsonb') = 2 THEN 'PASS' ELSE 'FAIL' END AS result,
  (SELECT string_agg(name || ':' || coalesce(data_type, 'MISSING'), ', ') FROM colres) AS detail
UNION ALL SELECT 2, 'both CHECK constraints present and validated',
  CASE WHEN (SELECT count(*) FROM expc e JOIN cons c ON c.conname = e.conname AND c.tbl = e.tbl AND c.convalidated) = 2 THEN 'PASS' ELSE 'FAIL' END,
  coalesce((SELECT string_agg(tbl || '.' || conname || ' validated=' || convalidated, ', ') FROM cons), 'none found')
UNION ALL SELECT 3, 'sync_land_zoning_info triggers enabled (lands, property_submissions)',
  CASE WHEN (SELECT count(*) FROM trg WHERE tgenabled = 'O' AND (tgtype & 1) = 1 AND (tgtype & 2) = 2) = 2 THEN 'PASS' ELSE 'FAIL' END,
  coalesce((SELECT string_agg(tbl || ' enabled=' || tgenabled::text, ', ') FROM trg), 'none found') || ' (O = enabled, row-level, BEFORE)'
UNION ALL SELECT 4, 'functions exist (valid_zoning_info, sync_land_zoning_info)',
  CASE WHEN (SELECT count(*) FROM fn) = 2 THEN 'PASS' ELSE 'FAIL' END,
  coalesce((SELECT string_agg(proname, ', ') FROM fn), 'none')
UNION ALL SELECT 5, 'no rows violating valid_zoning_info',
  CASE WHEN lands_bad = 0 AND subs_bad = 0 THEN 'PASS' ELSE 'FAIL' END,
  'lands=' || lands_bad || ' property_submissions=' || subs_bad FROM bad
UNION ALL SELECT 6, 'Kabin Buri expected state (green, owner_reported, legacy zoning=green)',
  CASE WHEN n = 1 AND ok = 1 THEN 'PASS' WHEN n = 1 THEN 'REVIEW' ELSE 'FAIL' END,
  CASE WHEN n <> 1 THEN n || ' live rows with slug' WHEN ok = 1 THEN 'ok; verification_status=' || vstatus
       ELSE 'differs from the reported correction (may be an admin-approved edit): inspect in /manage/zoning' END FROM kb
UNION ALL SELECT 7, 'active lands, owner_reported, with source/evidence_url text',
  CASE WHEN n = 0 THEN 'PASS' ELSE 'REVIEW' END,
  n || ' rows (expected 0 unless admin-approved; the Kabin Buri correction itself carries a source text, so 1 is explainable - confirm it is that row)' FROM pub
UNION ALL SELECT 8, 'zoning_info coverage', 'INFO',
  'lands_with_zoning_info=' || (SELECT count(*) FROM public.lands WHERE zoning_info IS NOT NULL)
  || ' submissions_with_zoning_info=' || (SELECT count(*) FROM public.property_submissions WHERE zoning_info IS NOT NULL)
UNION ALL SELECT 50, 'row counts (saved preflight: legacy_zoning_lands +1 only for initial NULL-to-green correction, otherwise +0; all other counts unchanged)', 'INFO',
  'lands=' || (SELECT count(*) FROM public.lands) || ' live=' || (SELECT count(*) FROM public.lands WHERE deleted_at IS NULL)
  || ' legacy_zoning_lands=' || (SELECT count(*) FROM public.lands WHERE zoning IS NOT NULL)
  || ' submissions=' || (SELECT count(*) FROM public.property_submissions)
  || ' legacy_zoning_submissions=' || (SELECT count(*) FROM public.property_submissions WHERE zoning IS NOT NULL)
UNION ALL SELECT 51, 'lands verification (compare with preflight; Kabin Buri may move verified->pending)', 'INFO',
  'verified=' || (SELECT count(*) FROM public.lands WHERE verification_status = 'verified')
  || ' pending=' || (SELECT count(*) FROM public.lands WHERE verification_status = 'pending')
ORDER BY ord;
