-- Zoning RECOVERY: remove the trigger, sync function, CHECK constraints and validator. DATA IS PRESERVED:
-- the zoning_info columns and every value in them stay. Idempotent (safe to run twice).
-- Use ONLY if the trigger/constraints themselves misbehave (e.g. legitimate saves rejected).
-- Do NOT use it because the app deploy failed: redeploy the previous Vercel deployment instead (old app is
-- compatible with the migrated DB).
-- After this, legacy `zoning` and `zoning_info` can drift apart (nothing syncs them, nothing resets
-- verification_status on zoning_info changes). The new app still works; re-apply the migration
-- (fixed) to restore the guarantees. The migration is re-runnable.
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/zoning-rollback.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TRIGGER IF EXISTS sync_land_zoning_info ON public.lands;
DROP TRIGGER IF EXISTS sync_land_zoning_info ON public.property_submissions;
ALTER TABLE public.lands DROP CONSTRAINT IF EXISTS lands_zoning_info_valid;
ALTER TABLE public.property_submissions DROP CONSTRAINT IF EXISTS submissions_zoning_info_valid;
DROP FUNCTION IF EXISTS public.sync_land_zoning_info();
DROP FUNCTION IF EXISTS public.valid_zoning_info(jsonb);

COMMIT;

-- DESTRUCTIVE, SEPARATE STEP. Not part of the rollback. Only after exporting the data, e.g.
--   \copy (SELECT id, slug, zoning, zoning_info FROM public.lands WHERE zoning_info IS NOT NULL) TO 'lands_zoning_info.csv' CSV HEADER
--   \copy (SELECT id, zoning, zoning_info FROM public.property_submissions WHERE zoning_info IS NOT NULL) TO 'subs_zoning_info.csv' CSV HEADER
-- and confirming the file is non-empty and readable. Then, deliberately, in a separate session:
-- BEGIN;
-- ALTER TABLE public.lands DROP COLUMN IF EXISTS zoning_info;
-- ALTER TABLE public.property_submissions DROP COLUMN IF EXISTS zoning_info;
-- COMMIT;
