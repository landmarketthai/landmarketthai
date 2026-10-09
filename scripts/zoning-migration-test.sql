\set ON_ERROR_STOP on
-- Run only against an empty disposable PostgreSQL database.
CREATE TYPE zoning_enum AS ENUM ('purple','purple_light','brown','orange','yellow','green','other');
CREATE TABLE public.lands (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text UNIQUE NOT NULL, zoning zoning_enum,
  verification_status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz, status text DEFAULT 'active'
);
CREATE TABLE public.property_submissions (id integer PRIMARY KEY, zoning text, verification_status text DEFAULT 'pending', updated_at timestamptz DEFAULT now());
INSERT INTO public.lands (slug,zoning,verification_status) VALUES
  ('legacy-purple','purple','verified'),
  ('unknown',null,'pending'), ('count-unknown',null,'pending'), ('101-rai-kabin-buri',null,'pending');

-- The postflight comparison is exact and based on this run's saved preflight.
CREATE TEMP VIEW zoning_counts AS SELECT
  (SELECT count(*) FROM public.lands) AS lands,
  (SELECT count(*) FROM public.lands WHERE deleted_at IS NULL) AS live,
  (SELECT count(*) FROM public.lands WHERE zoning IS NOT NULL) AS legacy_zoning_lands,
  (SELECT count(*) FROM public.property_submissions) AS submissions,
  (SELECT count(*) FROM public.property_submissions WHERE zoning IS NOT NULL) AS legacy_zoning_submissions,
  (SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object('zoning_info', to_jsonb(l)->'zoning_info') ORDER BY id)
    FROM public.lands l WHERE slug <> '101-rai-kabin-buri') AS other_lands;
CREATE TEMP TABLE zoning_baseline AS SELECT * FROM zoning_counts;
CREATE FUNCTION pg_temp.zoning_counts_match(delta integer) RETURNS boolean LANGUAGE sql AS $test$
  SELECT c.lands = b.lands AND c.live = b.live
    AND c.legacy_zoning_lands = b.legacy_zoning_lands + delta
    AND c.submissions = b.submissions AND c.legacy_zoning_submissions = b.legacy_zoning_submissions
    AND c.other_lands IS NOT DISTINCT FROM b.other_lands
  FROM zoning_counts c CROSS JOIN zoning_baseline b;
$test$;

\ir ../neon/migrations/202610080001_zoning_info.sql
DO $test$
BEGIN
  ASSERT pg_temp.zoning_counts_match(1), 'initial correction: exactly +1 legacy land, all unrelated data unchanged';
  ASSERT NOT pg_temp.zoning_counts_match(0), 'initial correction must not accept unchanged legacy count';
END;
$test$;
\ir zoning-postflight.sql
TRUNCATE zoning_baseline;
INSERT INTO zoning_baseline SELECT * FROM zoning_counts;
\ir ../neon/migrations/202610080001_zoning_info.sql
DO $test$
BEGIN
  ASSERT pg_temp.zoning_counts_match(0), 'rerun: all counts and unrelated data unchanged';
  ASSERT NOT pg_temp.zoning_counts_match(1), 'rerun must not accept an extra legacy land';
END;
$test$;

DO $test$
DECLARE info jsonb; invalid jsonb;
BEGIN
  SELECT zoning_info INTO info FROM public.lands WHERE slug = 'legacy-purple';
  ASSERT info IS NULL, 'legacy data not rewritten';
  ASSERT (SELECT verification_status = 'verified' AND zoning = 'purple' FROM public.lands WHERE slug = 'legacy-purple'), 'migration preserves existing Verified';
  ASSERT (SELECT zoning_info IS NULL AND zoning IS NULL FROM public.lands WHERE slug = 'unknown'), 'unknown data not rewritten';
  SELECT zoning_info INTO info FROM public.lands WHERE slug = '101-rai-kabin-buri';
  ASSERT info#>>'{zones,0,color}' = 'green' AND info->>'status' = 'owner_reported', 'Kabin green reported';
  ASSERT info#>>'{zones,0,type_code}' = '' AND info->>'plan_name' = '' AND info->>'checked_at' = '' AND info->>'evidence_url' = '', 'no invented facts';

  info := jsonb_set(info, '{zones}', '[{"color":null,"type_code":"ย.1","type_name":""},{"color":"yellow","type_code":"","type_name":""},{"color":"green","type_code":"","type_name":""}]');
  UPDATE public.lands SET zoning_info = info WHERE slug = 'unknown';
  ASSERT (SELECT zoning = 'yellow' AND jsonb_array_length(zoning_info->'zones') = 3 FROM public.lands WHERE slug = 'unknown'), 'multi-color sync';

  FOR invalid IN SELECT value FROM jsonb_array_elements('[null,[],{}, {"zones":null}]'::jsonb) LOOP
    ASSERT NOT public.valid_zoning_info(invalid), 'invalid structure';
  END LOOP;
  ASSERT NOT public.valid_zoning_info(jsonb_set(info,'{checked_at}','"2026-02-30"')), 'invalid calendar date';
  ASSERT NOT public.valid_zoning_info(jsonb_set(info,'{status}','"document_verified"')), 'missing evidence';
  ASSERT NOT public.valid_zoning_info(jsonb_set(info,'{evidence_url}','"javascript:alert(1)"')), 'unsafe link';
  ASSERT NOT public.valid_zoning_info(jsonb_set(info,'{zones,1,color}','"invented"')), 'invalid color';
  ASSERT NOT public.valid_zoning_info(jsonb_set(info,'{source}','null')), 'null source';

  BEGIN
    UPDATE public.lands SET zoning = 'purple' WHERE slug = 'unknown';
    RAISE EXCEPTION 'legacy-only edit unexpectedly allowed';
  EXCEPTION WHEN SQLSTATE 'LZ409' THEN NULL;
  END;

  UPDATE public.lands SET verification_status = 'verified' WHERE slug = 'unknown';
  UPDATE public.lands SET zoning_info = jsonb_set(zoning_info,'{source}','"new source"') WHERE slug = 'unknown';
  ASSERT (SELECT verification_status = 'pending' FROM public.lands WHERE slug = 'unknown'), 'source changes revoke verification';

  info := info || '{"status":"document_verified","source":"reviewed document","checked_at":"2026-10-08","evidence_url":"https://example.com/evidence.pdf"}';
  UPDATE public.lands SET zoning_info = info WHERE slug = 'unknown';
  ASSERT (SELECT zoning_info->>'status' = 'document_verified' FROM public.lands WHERE slug = 'unknown'), 'valid evidence accepted';
END;
$test$;
-- B1: legacy-only writes (stale bundle / pre-zoning_info server) on both tables.
INSERT INTO public.lands (slug) VALUES ('b1-null'), ('b1-empty'), ('b1-multi'), ('b1-doc');
INSERT INTO public.property_submissions (id) VALUES (1), (2), (3), (4);
UPDATE public.lands SET zoning_info = '{"zones":[],"status":"unknown","plan_name":"","source":"","checked_at":"","evidence_url":""}' WHERE slug = 'b1-empty';
UPDATE public.property_submissions SET zoning_info = '{"zones":[],"status":"unknown","plan_name":"","source":"","checked_at":"","evidence_url":""}' WHERE id = 2;
UPDATE public.lands SET zoning_info = '{"zones":[{"color":"green","type_code":"","type_name":""},{"color":"yellow","type_code":"ย.1","type_name":""}],"status":"owner_reported","plan_name":"","source":"s","checked_at":"","evidence_url":""}' WHERE slug = 'b1-multi';
UPDATE public.property_submissions SET zoning_info = '{"zones":[{"color":"green","type_code":"","type_name":""},{"color":"yellow","type_code":"ย.1","type_name":""}],"status":"owner_reported","plan_name":"","source":"s","checked_at":"","evidence_url":""}' WHERE id = 3;
UPDATE public.lands SET zoning_info = '{"zones":[{"color":"green","type_code":"","type_name":""}],"status":"document_verified","plan_name":"","source":"doc","checked_at":"2026-10-08","evidence_url":"https://example.com/e.pdf"}', verification_status = 'verified' WHERE slug = 'b1-doc';
UPDATE public.property_submissions SET zoning_info = '{"zones":[{"color":"green","type_code":"","type_name":""}],"status":"document_verified","plan_name":"","source":"doc","checked_at":"2026-10-08","evidence_url":"https://example.com/e.pdf"}' WHERE id = 4;

DO $test$
DECLARE t text; k text; keys text[]; before jsonb; after jsonb; code text; canon jsonb;
BEGIN
  FOREACH t IN ARRAY ARRAY['lands','property_submissions'] LOOP
    keys := CASE t WHEN 'lands' THEN ARRAY['slug=''b1-null''','slug=''b1-empty''','slug=''b1-multi''','slug=''b1-doc'''] ELSE ARRAY['id=1','id=2','id=3','id=4'] END;
    -- NULL info + legacy write (old-server shape: no zoning_info in SET) converts, status unknown.
    EXECUTE format('UPDATE public.%s SET zoning = %L, updated_at = now() WHERE %s', t, 'purple', keys[1]) ;
    EXECUTE format('SELECT zoning_info FROM public.%s WHERE %s', t, keys[1]) INTO after;
    canon := '{"zones":[{"color":"purple","type_code":"","type_name":""}],"status":"unknown","plan_name":"","source":"","checked_at":"","evidence_url":""}';
    ASSERT after = canon, t || ': NULL info converted to canonical unknown';
    -- converted row stays convertible; legacy -> NULL clears the colour
    EXECUTE format('UPDATE public.%s SET zoning = %L WHERE %s', t, 'brown', keys[1]);
    EXECUTE format('SELECT zoning_info #>> %L FROM public.%s WHERE %s', '{zones,0,color}', t, keys[1]) INTO k;
    ASSERT k = 'brown', t || ': converted row re-converts';
    EXECUTE format('UPDATE public.%s SET zoning = NULL WHERE %s', t, keys[1]);
    EXECUTE format('SELECT jsonb_array_length(zoning_info->%L) = 0 AND zoning IS NULL FROM public.%s WHERE %s', 'zones', t, keys[1]) INTO k;
    ASSERT k::boolean, t || ': legacy NULL on convertible info clears zones';
    -- legacy NULL on NULL info is a no-op
    EXECUTE format('UPDATE public.%s SET zoning_info = NULL, zoning = NULL WHERE %s', t, keys[1]);
    EXECUTE format('UPDATE public.%s SET zoning = NULL WHERE %s', t, keys[1]);
    EXECUTE format('SELECT zoning_info IS NULL FROM public.%s WHERE %s', t, keys[1]) INTO k;
    ASSERT k::boolean, t || ': NULL -> NULL fine';
    -- empty info + legacy write converts
    EXECUTE format('UPDATE public.%s SET zoning = %L, updated_at = now() WHERE %s', t, 'orange', keys[2]);
    EXECUTE format('SELECT zoning_info FROM public.%s WHERE %s', t, keys[2]) INTO after;
    ASSERT after = jsonb_set(canon, '{zones,0,color}', '"orange"'), t || ': empty info converted';
    -- structured multi-colour: legacy change raises LZ409, row unchanged
    FOR k IN SELECT unnest(ARRAY[keys[3], keys[4]]) LOOP
      EXECUTE format('SELECT to_jsonb(x) FROM public.%s x WHERE %s', t, k) INTO before;
      code := NULL;
      BEGIN
        EXECUTE format('UPDATE public.%s SET zoning = %L, updated_at = now() WHERE %s', t, 'purple', k);
      EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
      END;
      ASSERT code = 'LZ409', t || ' ' || k || ': structured legacy write raises LZ409, got ' || coalesce(code, 'none');
      EXECUTE format('SELECT to_jsonb(x) FROM public.%s x WHERE %s', t, k) INTO after;
      ASSERT after = before, t || ' ' || k || ': row unchanged (evidence intact)';
      -- same colour as derived first colour is not a change
      EXECUTE format('UPDATE public.%s SET zoning = %L, updated_at = now() WHERE %s', t, 'green', k);
      EXECUTE format('SELECT to_jsonb(x) FROM public.%s x WHERE %s', t, k) INTO after;
      ASSERT (after - 'updated_at') = (before - 'updated_at'), t || ' ' || k || ': same-colour legacy write no change';
    END LOOP;
  END LOOP;
  -- INSERT paths unaffected (legacy-only insert, and structured insert)
  INSERT INTO public.lands (slug, zoning) VALUES ('b1-insert-legacy', 'green');
  ASSERT (SELECT zoning_info IS NULL AND zoning = 'green' FROM public.lands WHERE slug = 'b1-insert-legacy'), 'legacy insert untouched';
  INSERT INTO public.property_submissions (id, zoning_info) VALUES (5, '{"zones":[{"color":"yellow","type_code":"","type_name":""}],"status":"unknown","plan_name":"","source":"","checked_at":"","evidence_url":""}');
  ASSERT (SELECT zoning = 'yellow' FROM public.property_submissions WHERE id = 5), 'structured insert derives colour';
END;
$test$;
-- Admin-reviewed Kabin: re-applying the migration must skip with a NOTICE, not abort.
UPDATE public.lands SET zoning_info = zoning_info || '{"status":"map_checked","source":"existing reviewed source","checked_at":"2026-10-08","evidence_url":"https://example.com/map"}'
WHERE slug = '101-rai-kabin-buri';
TRUNCATE zoning_baseline;
INSERT INTO zoning_baseline SELECT * FROM zoning_counts;
\ir ../neon/migrations/202610080001_zoning_info.sql
DO $test$
BEGIN
  ASSERT (SELECT zoning_info->>'status' = 'map_checked' AND zoning_info->>'source' = 'existing reviewed source' FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'migration must not replace reviewed evidence';
  ASSERT pg_temp.zoning_counts_match(0), 'post-admin rerun: exact zero count delta';
END;
$test$;
-- Admin can clear the color; an existing zoning_info still makes the rerun a no-op.
UPDATE public.lands SET zoning_info = jsonb_set(zoning_info, '{zones}', '[]')
WHERE slug = '101-rai-kabin-buri';
UPDATE public.lands SET verification_status = 'verified' WHERE slug = '101-rai-kabin-buri';
CREATE TEMP TABLE reviewed_kabin AS SELECT to_jsonb(l) AS row FROM public.lands l WHERE slug = '101-rai-kabin-buri';
TRUNCATE zoning_baseline;
INSERT INTO zoning_baseline SELECT * FROM zoning_counts;
\ir ../neon/migrations/202610080001_zoning_info.sql
\ir zoning-postflight.sql
DO $test$
BEGIN
  ASSERT (SELECT zoning IS NULL FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'reviewed Kabin can have no legacy color';
  ASSERT pg_temp.zoning_counts_match(0), 'post-admin color removal: rerun still requires exact zero delta';
  ASSERT (SELECT to_jsonb(l) = (SELECT row FROM reviewed_kabin) FROM public.lands l WHERE slug = '101-rai-kabin-buri'), 'rerun preserves reviewed Kabin and verification';
  -- Negative controls: unrelated changes cannot consume the correction allowance.
  UPDATE public.lands SET zoning = 'green' WHERE slug = 'count-unknown';
  ASSERT NOT pg_temp.zoning_counts_match(1), 'unrelated +1 must fail even with a +1 allowance';
  UPDATE public.lands SET zoning = NULL WHERE slug = 'legacy-purple';
  ASSERT (SELECT legacy_zoning_lands FROM zoning_counts) = (SELECT legacy_zoning_lands FROM zoning_baseline), 'negative control has offsetting counts';
  ASSERT NOT pg_temp.zoning_counts_match(0), 'offsetting unrelated changes must fail the snapshot comparison';
END;
$test$;
-- Expected failure: legacy zoning with no structured facts is unknown territory and still stops the correction.
UPDATE public.lands SET zoning_info = NULL, zoning = 'purple' WHERE slug = '101-rai-kabin-buri';
\set ON_ERROR_STOP off
\ir ../neon/migrations/202610080001_zoning_info.sql
\set ON_ERROR_STOP on
DO $test$
BEGIN
  ASSERT (SELECT zoning_info IS NULL AND zoning = 'purple' FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'migration must stop on conflicting legacy Kabin color';
END;
$test$;
SELECT 'Zoning migration assertions passed' AS result;
