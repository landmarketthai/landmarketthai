-- Prepared only. Review and test on an isolated PostgreSQL database before production.
BEGIN;

ALTER TABLE public.lands ADD COLUMN IF NOT EXISTS zoning_info jsonb;
ALTER TABLE public.property_submissions ADD COLUMN IF NOT EXISTS zoning_info jsonb;

CREATE OR REPLACE FUNCTION public.valid_zoning_info(info jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE zone jsonb; field text; checked date;
BEGIN
  IF info IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(info) <> 'object'
    OR NOT info ?& ARRAY['zones','status','plan_name','source','checked_at','evidence_url']
    OR info - ARRAY['zones','status','plan_name','source','checked_at','evidence_url'] <> '{}'::jsonb
    OR jsonb_typeof(info->'zones') <> 'array'
    OR jsonb_typeof(info->'status') <> 'string'
    OR info->>'status' NOT IN ('unknown','owner_reported','map_checked','document_verified') THEN RETURN false; END IF;
  IF jsonb_array_length(info->'zones') > 20 THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['plan_name','source','checked_at','evidence_url'] LOOP
    IF jsonb_typeof(info->field) <> 'string' THEN RETURN false; END IF;
    IF length(info->>field) > (CASE WHEN field = 'evidence_url' THEN 2000 ELSE 500 END) THEN RETURN false; END IF;
  END LOOP;
  FOR zone IN SELECT value FROM jsonb_array_elements(info->'zones') LOOP
    IF jsonb_typeof(zone) <> 'object'
      OR NOT zone ?& ARRAY['color','type_code','type_name']
      OR zone - ARRAY['color','type_code','type_name'] <> '{}'::jsonb THEN RETURN false; END IF;
    IF zone->'color' <> 'null'::jsonb AND (
      jsonb_typeof(zone->'color') <> 'string' OR zone->>'color' NOT IN ('purple','purple_light','brown','orange','yellow','green','other')
    ) THEN RETURN false; END IF;
    FOREACH field IN ARRAY ARRAY['type_code','type_name'] LOOP
      IF jsonb_typeof(zone->field) <> 'string' OR length(zone->>field) > 500 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  IF info->>'checked_at' <> '' THEN
    IF info->>'checked_at' !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
    checked := (info->>'checked_at')::date;
  END IF;
  IF info->>'evidence_url' <> '' AND info->>'evidence_url' !~ '^https?://[^[:space:]]+$' THEN RETURN false; END IF;
  IF info->>'status' IN ('map_checked','document_verified') AND (
    btrim(info->>'source') = '' OR info->>'checked_at' = '' OR info->>'evidence_url' = ''
  ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$fn$;

ALTER TABLE public.lands DROP CONSTRAINT IF EXISTS lands_zoning_info_valid;
ALTER TABLE public.lands ADD CONSTRAINT lands_zoning_info_valid CHECK (public.valid_zoning_info(zoning_info));
ALTER TABLE public.property_submissions DROP CONSTRAINT IF EXISTS submissions_zoning_info_valid;
ALTER TABLE public.property_submissions ADD CONSTRAINT submissions_zoning_info_valid CHECK (public.valid_zoning_info(zoning_info));

-- Keep the existing single-color column compatible; structured data is canonical.
CREATE OR REPLACE FUNCTION public.sync_land_zoning_info()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF new.zoning IS DISTINCT FROM old.zoning AND new.zoning_info IS NOT DISTINCT FROM old.zoning_info THEN
      RAISE EXCEPTION 'Update zoning_info together with zoning; legacy-only edits could erase multiple colors and evidence';
    END IF;
  END IF;
  IF new.zoning_info IS NOT NULL THEN
    IF NOT public.valid_zoning_info(new.zoning_info) THEN RAISE EXCEPTION 'Invalid zoning_info'; END IF;
    new.zoning := (SELECT value->>'color' FROM jsonb_array_elements(new.zoning_info->'zones') WITH ORDINALITY AS zones(value, position)
      WHERE value->>'color' IS NOT NULL ORDER BY position LIMIT 1);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF new.zoning_info IS DISTINCT FROM old.zoning_info THEN
      new.verification_status := 'pending';
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

DROP TRIGGER IF EXISTS sync_land_zoning_info ON public.lands;
CREATE TRIGGER sync_land_zoning_info BEFORE INSERT OR UPDATE ON public.lands
FOR EACH ROW EXECUTE FUNCTION public.sync_land_zoning_info();
DROP TRIGGER IF EXISTS sync_land_zoning_info ON public.property_submissions;
CREATE TRIGGER sync_land_zoning_info BEFORE INSERT OR UPDATE ON public.property_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_land_zoning_info();

-- Keep legacy rows untouched: the shared reader supports them without revoking Verified.
-- The user supplied a correction for previously unknown zoning, not a replacement for known facts.
-- The target's generic listing review becomes pending; other Verified rows are untouched.
DO $fn$
DECLARE correction jsonb := '{"zones":[{"color":"green","type_code":"","type_name":""}],"status":"owner_reported","plan_name":"","source":"พี่ไกรแจ้ง ยังไม่มีหลักฐานทางการ","checked_at":"","evidence_url":""}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.lands WHERE slug = '101-rai-kabin-buri'
    AND deleted_at IS NULL AND zoning_info IS DISTINCT FROM correction
    AND (zoning_info IS NOT NULL OR zoning IS NOT NULL)) THEN
    RAISE EXCEPTION 'Kabin Buri has existing zoning facts; reconcile before applying this correction';
  END IF;
  UPDATE public.lands SET zoning_info = correction, updated_at = now()
  WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL AND zoning_info IS DISTINCT FROM correction;
END;
$fn$;

COMMENT ON COLUMN public.lands.zoning_info IS 'Reported zoning colors/types, plan, source, review date, evidence and status. Color alone never establishes permitted factory use. Only public source/evidence references belong here.';
COMMIT;
