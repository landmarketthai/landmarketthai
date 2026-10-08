\set ON_ERROR_STOP on
-- Run only against an empty disposable PostgreSQL database.
CREATE TYPE zoning_enum AS ENUM ('purple','purple_light','brown','orange','yellow','green','other');
CREATE TABLE public.lands (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text UNIQUE NOT NULL, zoning zoning_enum,
  verified_at timestamptz, verified_by uuid,
  verification_status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.property_submissions (id integer PRIMARY KEY, zoning text, verification_status text DEFAULT 'pending');
INSERT INTO public.lands (slug,zoning,verified_at,verified_by) VALUES
  ('legacy-purple','purple',now(),'00000000-0000-0000-0000-000000000001'),
  ('unknown',null,null,null), ('101-rai-kabin-buri',null,null,null);
\ir ../neon/migrations/202610080001_zoning_info.sql
\ir ../neon/migrations/202610080001_zoning_info.sql

DO $test$
DECLARE info jsonb; invalid jsonb;
BEGIN
  SELECT zoning_info INTO info FROM public.lands WHERE slug = 'legacy-purple';
  ASSERT info IS NULL, 'legacy data not rewritten';
  ASSERT (SELECT verified_at IS NOT NULL AND verified_by IS NOT NULL AND zoning = 'purple' FROM public.lands WHERE slug = 'legacy-purple'), 'migration preserves existing Verified';
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
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'legacy-only edit unexpectedly allowed' THEN RAISE; END IF;
  END;

  UPDATE public.lands SET verified_at = now(), verified_by = '00000000-0000-0000-0000-000000000001' WHERE slug = 'unknown';
  UPDATE public.lands SET zoning_info = jsonb_set(zoning_info,'{source}','"new source"') WHERE slug = 'unknown';
  ASSERT (SELECT verified_at IS NULL AND verified_by IS NULL FROM public.lands WHERE slug = 'unknown'), 'source changes revoke verification';

  info := info || '{"status":"document_verified","source":"reviewed document","checked_at":"2026-10-08","evidence_url":"https://example.com/evidence.pdf"}';
  UPDATE public.lands SET zoning_info = info WHERE slug = 'unknown';
  ASSERT (SELECT zoning_info->>'status' = 'document_verified' FROM public.lands WHERE slug = 'unknown'), 'valid evidence accepted';
END;
$test$;
UPDATE public.lands SET zoning_info = zoning_info || '{"status":"map_checked","source":"existing reviewed source","checked_at":"2026-10-08","evidence_url":"https://example.com/map"}'
WHERE slug = '101-rai-kabin-buri';
-- Expected failure: the migration must preserve existing reviewed evidence.
\set ON_ERROR_STOP off
\ir ../neon/migrations/202610080001_zoning_info.sql
\set ON_ERROR_STOP on
DO $test$
BEGIN
  ASSERT (SELECT zoning_info->>'status' = 'map_checked' AND zoning_info->>'source' = 'existing reviewed source' FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'migration must not replace reviewed evidence';
END;
$test$;
SELECT 'Zoning migration assertions passed' AS result;
