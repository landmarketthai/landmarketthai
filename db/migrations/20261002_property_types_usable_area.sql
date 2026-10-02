-- Expanded seller/buyer property types + optional usable area (sq.m.) for non-land assets.
-- Idempotent: safe to re-run. Only widens constraints and adds nullable columns, so every
-- existing row stays valid. Keep the list in sync with PROPERTY_TYPE_LABELS
-- (src/lib/marketplace/presentation.ts).
--
-- Canonical property types:
--   land, house, house_with_land, townhouse, condo, housing_project, commercial_building, office,
--   factory, warehouse, apartment, hotel_resort, retail, business_property, other
-- Published submissions keep lands.land_type = property_type, so lands.land_type accepts the
-- canonical set plus the legacy public categories (industrial, eec, logistics, data_center, investment).
--
-- Every CHECK constraint below is added NOT VALID then VALIDATEd in a separate statement: the
-- ADD CONSTRAINT itself only takes ACCESS EXCLUSIVE for a metadata change (no table scan), and
-- VALIDATE CONSTRAINT re-scans under the much weaker SHARE UPDATE EXCLUSIVE lock, which does not
-- block concurrent reads or writes. Since every change here only widens an existing allowlist,
-- validation always succeeds against current data.

alter table property_submissions add column if not exists usable_area_sqm numeric(14,2);
alter table lands add column if not exists usable_area_sqm numeric(14,2);

alter table property_submissions drop constraint if exists property_submissions_usable_area_check;
alter table property_submissions add constraint property_submissions_usable_area_check
  check (usable_area_sqm is null or usable_area_sqm >= 0) not valid;
alter table property_submissions validate constraint property_submissions_usable_area_check;

alter table lands drop constraint if exists lands_usable_area_check;
alter table lands add constraint lands_usable_area_check
  check (usable_area_sqm is null or usable_area_sqm >= 0) not valid;
alter table lands validate constraint lands_usable_area_check;

alter table property_submissions drop constraint if exists property_submissions_property_type_check;
alter table property_submissions add constraint property_submissions_property_type_check
  check (property_type is null or property_type in (
    'land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project', 'commercial_building', 'office',
    'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail', 'business_property', 'other')) not valid;
alter table property_submissions validate constraint property_submissions_property_type_check;

alter table lands drop constraint if exists lands_property_type_check;
alter table lands add constraint lands_property_type_check
  check (property_type in (
    'land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project', 'commercial_building', 'office',
    'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail', 'business_property', 'other')) not valid;
alter table lands validate constraint lands_property_type_check;

alter table buyer_requirements drop constraint if exists buyer_requirements_property_type_check;
alter table buyer_requirements add constraint buyer_requirements_property_type_check
  check (property_type is null or property_type in (
    'land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project', 'commercial_building', 'office',
    'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail', 'business_property', 'other')) not valid;
alter table buyer_requirements validate constraint buyer_requirements_property_type_check;

-- The public projection copies buyer_requirements.property_type into buyer_demand.land_type.
alter table buyer_demand drop constraint if exists buyer_demand_land_type_check;
alter table buyer_demand add constraint buyer_demand_land_type_check
  check (not is_public or land_type is null or land_type in (
    'industrial', 'eec', 'logistics', 'data_center', 'investment',
    'land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project', 'commercial_building', 'office',
    'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail', 'business_property', 'other')) not valid;
alter table buyer_demand validate constraint buyer_demand_land_type_check;

-- lands.land_type is text + CHECK on Neon; legacy Supabase-era schemas used land_type_enum.
do $$
declare
  value text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'lands' and column_name = 'land_type'
      and data_type = 'USER-DEFINED' and udt_name = 'land_type_enum'
  ) then
    foreach value in array array['land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project',
      'commercial_building', 'office', 'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail',
      'business_property', 'other']
    loop
      execute format('alter type land_type_enum add value if not exists %L', value);
    end loop;
  else
    alter table lands drop constraint if exists lands_land_type_check;
    alter table lands add constraint lands_land_type_check
      check (land_type in ('industrial', 'eec', 'logistics', 'data_center', 'investment',
        'land', 'house', 'house_with_land', 'townhouse', 'condo', 'housing_project', 'commercial_building', 'office',
        'factory', 'warehouse', 'apartment', 'hotel_resort', 'retail', 'business_property', 'other')) not valid;
    alter table lands validate constraint lands_land_type_check;
  end if;
end $$;
