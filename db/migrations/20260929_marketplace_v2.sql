-- LandmarketThai Marketplace V2
-- Incremental, backward-compatible schema expansion.
-- Existing public inventory in lands remains the source of truth.

do $$
begin
  if exists (select 1 from pg_type where typname = 'land_type_enum') then
    alter type land_type_enum add value if not exists 'land';
  end if;
  if exists (select 1 from pg_type where typname = 'listing_status_enum') then
    alter type listing_status_enum add value if not exists 'expired';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'lands'
      and column_name = 'total_price' and is_generated = 'ALWAYS'
  ) then
    alter table lands alter column total_price drop expression;
  end if;
end $$;

alter table lands alter column size_rai type numeric(14,5);

alter table lands
  add column if not exists property_type text not null default 'land',
  add column if not exists transaction_type text not null default 'sale',
  add column if not exists subdistrict text,
  add column if not exists address text,
  add column if not exists area_rai integer,
  add column if not exists area_ngan integer,
  add column if not exists area_sqwa numeric(10,2),
  add column if not exists depth_min_m numeric(12,2),
  add column if not exists depth_max_m numeric(12,2),
  add column if not exists road_name text,
  add column if not exists road_width_m numeric(12,2),
  add column if not exists rent_price_monthly numeric(16,2),
  add column if not exists verification_status text not null default 'pending',
  add column if not exists published_at timestamptz;

update lands
set property_type = case
  when land_type = 'factory' then 'factory'
  when land_type = 'warehouse' then 'warehouse'
  else 'land'
end
where property_type is null or property_type = 'land';

update lands set transaction_type = 'sale' where transaction_type is null;

-- Preserve the verified legal size exactly; the legacy column only stored two decimals.
update lands set size_rai = 36.91825 where slug = '37-rai-eec-rayong';

update lands
set
  area_rai = floor(size_rai)::integer,
  area_ngan = floor((size_rai - floor(size_rai)) * 4)::integer,
  area_sqwa = round(
    ((((size_rai - floor(size_rai)) * 4) - floor((size_rai - floor(size_rai)) * 4)) * 100)::numeric,
    2
  )
where size_rai is not null
  and (area_rai is null or area_ngan is null or area_sqwa is null);

-- Exact depth supplied for the verified 36.91825-rai Rayong listing.
update lands
set depth_min_m = 216,
    depth_max_m = 241
where slug = '37-rai-eec-rayong'
  and depth_min_m is null
  and depth_max_m is null;

update lands
set verification_status = 'verified',
    published_at = coalesce(published_at, created_at)
where status in ('active', 'sold');

alter table lands drop constraint if exists lands_property_type_check;
alter table lands add constraint lands_property_type_check
  check (property_type in ('land', 'factory', 'warehouse'));

alter table lands drop constraint if exists lands_transaction_type_check;
alter table lands add constraint lands_transaction_type_check
  check (transaction_type in ('sale', 'rent'));

alter table lands drop constraint if exists lands_verification_status_check;
alter table lands add constraint lands_verification_status_check
  check (verification_status in ('pending', 'verified', 'rejected'));

-- Factory / warehouse and rent listings do not always have land-size or price-per-rai values.
alter table lands alter column size_rai drop not null;
alter table lands alter column price_per_rai drop not null;

create unique index if not exists idx_lands_slug_live
  on lands (slug) where deleted_at is null;
create index if not exists idx_lands_search_core
  on lands (status, property_type, transaction_type, province_id)
  where deleted_at is null;
create index if not exists idx_lands_district
  on lands (district) where deleted_at is null and district is not null;
create index if not exists idx_lands_total_price
  on lands (total_price) where deleted_at is null and total_price is not null;
create index if not exists idx_lands_price_per_rai
  on lands (price_per_rai) where deleted_at is null and price_per_rai is not null;
create index if not exists idx_lands_lat_lng
  on lands (lat, lng)
  where deleted_at is null and lat is not null and lng is not null;

create table if not exists property_submissions (
  id uuid primary key default gen_random_uuid(),
  draft_token uuid not null default gen_random_uuid() unique,
  user_id text,
  owner_lead_id uuid references leads(id) on delete set null,
  linked_land_id uuid references lands(id) on delete set null,
  property_type text,
  transaction_type text,
  title text,
  province_id uuid references provinces(id),
  district text,
  subdistrict text,
  address text,
  lat numeric(10,7),
  lng numeric(10,7),
  location_precision text default 'approx',
  area_rai integer,
  area_ngan integer,
  area_sqwa numeric(10,2),
  total_rai numeric(14,5),
  frontage_m numeric(12,2),
  depth_min_m numeric(12,2),
  depth_max_m numeric(12,2),
  road_name text,
  road_width_m numeric(12,2),
  zoning text,
  sale_price numeric(16,2),
  price_per_rai numeric(16,2),
  rent_price_monthly numeric(16,2),
  description text,
  contact_name text,
  contact_phone text,
  contact_line text,
  status text not null default 'draft',
  verification_status text not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  constraint property_submissions_property_type_check
    check (property_type is null or property_type in ('land', 'factory', 'warehouse')),
  constraint property_submissions_transaction_type_check
    check (transaction_type is null or transaction_type in ('sale', 'rent')),
  constraint property_submissions_location_precision_check
    check (location_precision in ('exact', 'approx')),
  constraint property_submissions_status_check
    check (status in ('draft', 'pending_review', 'approved', 'published', 'rejected', 'sold', 'expired')),
  constraint property_submissions_verification_check
    check (verification_status in ('pending', 'verified', 'rejected')),
  constraint property_submissions_area_ngan_check
    check (area_ngan is null or area_ngan between 0 and 3),
  constraint property_submissions_area_sqwa_check
    check (area_sqwa is null or (area_sqwa >= 0 and area_sqwa < 100))
);

create index if not exists idx_property_submissions_status
  on property_submissions (status, created_at desc);
create index if not exists idx_property_submissions_user
  on property_submissions (user_id, updated_at desc) where user_id is not null;
create index if not exists idx_property_submissions_owner_lead
  on property_submissions (owner_lead_id) where owner_lead_id is not null;

create table if not exists property_submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references property_submissions(id) on delete cascade,
  media_kind text not null,
  file_name text not null,
  storage_key text not null unique,
  public_url text,
  mime_type text not null,
  size_bytes bigint not null,
  doc_type text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint property_submission_media_kind_check
    check (media_kind in ('image', 'document'))
);

create index if not exists idx_property_submission_media_submission
  on property_submission_media (submission_id, media_kind, sort_order);

create table if not exists buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  property_type text,
  transaction_type text not null default 'sale',
  preferred_locations text[] not null default '{}',
  province_ids uuid[] not null default '{}',
  min_size_rai numeric(14,5),
  max_size_rai numeric(14,5),
  max_price numeric(16,2),
  max_price_per_rai numeric(16,2),
  zoning text,
  purpose text,
  container_access boolean,
  high_voltage boolean,
  water_requirement text,
  name text not null,
  phone text not null,
  line_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_requirements_property_type_check
    check (property_type is null or property_type in ('land', 'factory', 'warehouse')),
  constraint buyer_requirements_transaction_type_check
    check (transaction_type in ('sale', 'rent')),
  constraint buyer_requirements_status_check
    check (status in ('active', 'matched', 'closed')),
  constraint buyer_requirements_size_check
    check (min_size_rai is null or max_size_rai is null or min_size_rai <= max_size_rai)
);

create index if not exists idx_buyer_requirements_status
  on buyer_requirements (status, created_at desc);
create index if not exists idx_buyer_requirements_property
  on buyer_requirements (property_type, transaction_type, status);
