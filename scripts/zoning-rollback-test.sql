\set ON_ERROR_STOP on
-- Run only against an empty disposable PostgreSQL database (cd scripts first or run from repo root with psql -f).
-- Proves scripts/zoning-rollback.sql keeps data, removes guards, is idempotent, and that the migration can be re-applied.
CREATE TYPE zoning_enum AS ENUM ('purple','purple_light','brown','orange','yellow','green','other');
CREATE TABLE public.lands (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text UNIQUE NOT NULL, zoning zoning_enum,
  verification_status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.property_submissions (id integer PRIMARY KEY, zoning text, verification_status text DEFAULT 'pending');
INSERT INTO public.lands (slug,zoning,verification_status) VALUES
  ('legacy-purple','purple','verified'), ('structured',null,'pending'), ('101-rai-kabin-buri',null,'pending');
INSERT INTO public.property_submissions (id, zoning) VALUES (1, 'green');

\ir ../neon/migrations/202610080001_zoning_info.sql

-- Structured, multi-zone data with evidence, in both tables.
UPDATE public.lands SET zoning_info = '{"zones":[{"color":"yellow","type_code":"ย.1","type_name":""},{"color":"green","type_code":"","type_name":""}],"status":"document_verified","plan_name":"plan A","source":"reviewed document","checked_at":"2026-10-08","evidence_url":"https://example.com/e.pdf"}'
WHERE slug = 'structured';
UPDATE public.property_submissions SET zoning_info = '{"zones":[{"color":"green","type_code":"","type_name":""}],"status":"owner_reported","plan_name":"","source":"","checked_at":"","evidence_url":""}' WHERE id = 1;

CREATE TEMP TABLE before_rb AS
  SELECT 'lands' AS t, slug AS k, zoning::text AS z, zoning_info AS zi, verification_status AS v FROM public.lands
  UNION ALL SELECT 'subs', id::text, zoning, zoning_info, verification_status FROM public.property_submissions;

\ir zoning-rollback.sql
\ir zoning-rollback.sql

DO $test$
BEGIN
  ASSERT (SELECT count(*) FROM (
    SELECT 'lands' AS t, slug AS k, zoning::text AS z, zoning_info AS zi, verification_status AS v FROM public.lands
    UNION ALL SELECT 'subs', id::text, zoning, zoning_info, verification_status FROM public.property_submissions
    EXCEPT SELECT * FROM before_rb) d) = 0, 'rollback changed data';
  ASSERT (SELECT count(*) FROM public.lands WHERE zoning_info IS NOT NULL) = 2, 'lands zoning_info kept (structured + Kabin Buri)';
  ASSERT (SELECT jsonb_array_length(zoning_info->'zones') = 2 FROM public.lands WHERE slug = 'structured'), 'multi-zone data kept';
  ASSERT (SELECT zoning_info IS NOT NULL FROM public.property_submissions WHERE id = 1), 'submission zoning_info kept';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_land_zoning_info'), 'triggers gone';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('lands_zoning_info_valid','submissions_zoning_info_valid')), 'constraints gone';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('sync_land_zoning_info','valid_zoning_info')), 'functions gone';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lands' AND column_name = 'zoning_info'), 'column kept';

  -- Legacy-only update (old/stale writer) now succeeds; no exception, structured data untouched.
  UPDATE public.lands SET zoning = 'purple' WHERE slug = 'structured';
  ASSERT (SELECT zoning::text = 'purple' AND jsonb_array_length(zoning_info->'zones') = 2 FROM public.lands WHERE slug = 'structured'), 'legacy-only update allowed after rollback';
  -- Previously-rejected structured value is accepted (constraint gone), proving guards are off.
  UPDATE public.lands SET zoning_info = '{"x":1}' WHERE slug = 'legacy-purple';
  UPDATE public.lands SET zoning_info = NULL WHERE slug = 'legacy-purple';
  -- Restore for forward recovery: re-sync drifted value so the re-applied constraint holds.
  UPDATE public.lands SET zoning = 'yellow' WHERE slug = 'structured';
END;
$test$;

-- Forward recovery: re-apply the migration on the rolled-back DB; data and guards return.
\ir ../neon/migrations/202610080001_zoning_info.sql

DO $test$
BEGIN
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname = 'sync_land_zoning_info' AND NOT tgisinternal) = 2, 'triggers back';
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conname IN ('lands_zoning_info_valid','submissions_zoning_info_valid') AND convalidated) = 2, 'constraints back and validated';
  ASSERT (SELECT jsonb_array_length(zoning_info->'zones') = 2 AND zoning_info->>'status' = 'document_verified' FROM public.lands WHERE slug = 'structured'), 'data intact after re-apply';
  ASSERT (SELECT zoning_info->>'status' = 'owner_reported' FROM public.lands WHERE slug = '101-rai-kabin-buri'), 'Kabin Buri still corrected';
END;
$test$;
SELECT 'Zoning rollback assertions passed' AS result;
