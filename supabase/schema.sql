-- LandmarketThai PostgreSQL Schema (Supabase)
-- Run in Supabase SQL editor.
-- All tables use uuid PKs, created_at/updated_at, soft-delete where useful.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Provinces ─────────────────────────────────────────────────────────────────
create table if not exists provinces (
  id          uuid primary key default gen_random_uuid(),
  name_th     text not null,
  name_en     text not null,
  slug        text not null unique,
  region      text,           -- e.g. EEC, Central, North
  lat         numeric(10,6),
  lng         numeric(10,6),
  created_at  timestamptz not null default now()
);

-- Seed key provinces
insert into provinces (name_th, name_en, slug, region, lat, lng) values
  ('ระยอง',       'Rayong',         'rayong',         'EEC',     12.6822, 101.2822),
  ('ชลบุรี',      'Chonburi',       'chonburi',       'EEC',     13.3622, 100.9847),
  ('ฉะเชิงเทรา', 'Chachoengsao',   'chachoengsao',   'EEC',     13.6904, 101.0779),
  ('สมุทรปราการ','Samut Prakan',   'samut-prakan',   'Central', 13.5991, 100.5998),
  ('อยุธยา',     'Ayutthaya',      'ayutthaya',      'Central', 14.3692, 100.5877),
  ('กรุงเทพมหานคร','Bangkok',       'bangkok',         'Central', 13.7563, 100.5018)
on conflict (slug) do nothing;

-- ── Lands ─────────────────────────────────────────────────────────────────────
create type land_type_enum as enum (
  'industrial','eec','factory','warehouse','logistics','data_center','investment'
);
create type zoning_enum as enum (
  'purple','purple_light','brown','orange','yellow','green','other'
);
create type location_precision_enum as enum ('exact','approx');
create type listing_status_enum as enum ('draft','active','reserved','sold','archived');

create table if not exists lands (
  id                  uuid primary key default gen_random_uuid(),
  public_ref          serial unique not null,
  title_th            text not null,
  slug                text not null,
  province_id         uuid not null references provinces(id),
  district            text,
  land_type           land_type_enum not null,
  size_rai            numeric(12,2) not null,
  zoning              zoning_enum,
  frontage_m          numeric(10,2),
  price_per_rai       numeric(16,2) not null,
  total_price         numeric(18,2) generated always as (size_rai * price_per_rai) stored,
  referral_reward_max numeric(16,2),
  is_eec              boolean not null default false,
  nearby_landmarks    text[],
  description         text,
  lat                 numeric(10,6),
  lng                 numeric(10,6),
  location_precision  location_precision_enum not null default 'approx',
  status              listing_status_enum not null default 'draft',
  is_featured         boolean not null default false,
  seo_title           text,
  seo_description     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists idx_lands_status on lands(status) where deleted_at is null;
create index if not exists idx_lands_province on lands(province_id);
create index if not exists idx_lands_type on lands(land_type);
create index if not exists idx_lands_featured on lands(is_featured) where status='active';

-- ── Land Images ───────────────────────────────────────────────────────────────
create table if not exists land_images (
  id              uuid primary key default gen_random_uuid(),
  land_id         uuid not null references lands(id) on delete cascade,
  storage_key     text not null,
  url_or_cdn_path text not null,
  mime_type       text,
  size_bytes      bigint,
  width           int,
  height          int,
  alt_th          text,
  sort_order      int not null default 0,
  is_cover        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_land_images_land on land_images(land_id);

-- ── Land Documents ────────────────────────────────────────────────────────────
create type doc_type_enum as enum ('title_deed','map','brochure','other');

create table if not exists land_documents (
  id          uuid primary key default gen_random_uuid(),
  land_id     uuid references lands(id) on delete set null,
  file_name   text not null,
  storage_key text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  doc_type    doc_type_enum not null default 'other',
  is_sensitive boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Leads ─────────────────────────────────────────────────────────────────────
create type lead_type_enum as enum ('buyer','partner','owner');
create type lead_status_enum as enum ('new','contacting','qualified','won','lost');

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  lead_type     lead_type_enum not null,
  name          text not null,
  phone         text not null,
  line_id       text,
  source        text,
  referral_code text,
  status        lead_status_enum not null default 'new',
  assigned_to   text,
  next_action_at timestamptz,
  last_reminded_at timestamptz,
  details       jsonb not null default '{}',
  consent_pdpa  boolean not null default false,
  consent_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_type on leads(lead_type);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_created on leads(created_at desc);
create index if not exists idx_leads_referral on leads(referral_code) where referral_code is not null;
create index if not exists idx_leads_next_action on leads(next_action_at) where next_action_at is not null;

-- ── Lead Attachments ──────────────────────────────────────────────────────────
create table if not exists lead_attachments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  file_name   text not null,
  storage_key text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  doc_type    doc_type_enum not null default 'other',
  is_sensitive boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_lead_attachments_lead on lead_attachments(lead_id);

-- ── Lead Activities ───────────────────────────────────────────────────────────
create table if not exists lead_activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  activity_type text not null default 'note' check (activity_type in ('note','call','line','site_visit','other')),
  note          text not null check (char_length(note) between 1 and 2000),
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead_created on lead_activities(lead_id, created_at desc);

-- Owner lead → canonical land link (added after leads exists so the FK is valid).
alter table lands add column if not exists owner_lead_id uuid references leads(id) on delete set null;
create unique index if not exists idx_lands_owner_lead_unique on lands(owner_lead_id) where owner_lead_id is not null;

-- ── Partners ──────────────────────────────────────────────────────────────────
create type partner_status_enum as enum ('pending','active','inactive');

create table if not exists partners (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete set null,
  name          text not null,
  phone         text not null,
  line_id       text,
  referral_code text not null unique,
  working_area  text,
  experience    text,
  network_size  text,
  status        partner_status_enum not null default 'pending',
  total_paid    numeric(18,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Deals ─────────────────────────────────────────────────────────────────────
create type deal_status_enum as enum ('in_progress','closed','cancelled');

create table if not exists deals (
  id             uuid primary key default gen_random_uuid(),
  land_id        uuid references lands(id),
  listing_ref    text,
  listing_title  text,
  buyer_lead_id  uuid references leads(id),
  partner_id     uuid references partners(id),
  referral_code  text,
  deal_value     numeric(18,2),
  commission_paid numeric(18,2),
  expected_commission numeric(18,2),
  status         deal_status_enum not null default 'in_progress',
  stage          text not null default 'qualified' check (stage in ('qualified','property_sent','site_visit','negotiation','offer','deposit','won','lost')),
  assigned_to    text,
  closed_at      timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_deals_stage on deals(stage);
create index if not exists idx_deals_buyer_lead on deals(buyer_lead_id) where buyer_lead_id is not null;
create index if not exists idx_deals_listing_ref on deals(listing_ref) where listing_ref is not null;

create table if not exists commissions (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references deals(id) on delete cascade,
  source_lead_id   uuid references leads(id) on delete set null,
  source_type      text not null check (source_type in ('buyer','owner')),
  partner_id       uuid references partners(id) on delete set null,
  referral_code    text,
  amount_estimated numeric(18,2),
  amount_approved  numeric(18,2),
  amount_paid      numeric(18,2) not null default 0,
  status           text not null default 'estimated' check (status in ('estimated','approved','payable','paid','cancelled')),
  approved_at      timestamptz,
  paid_at          timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(deal_id, source_type, source_lead_id)
);

create index if not exists idx_commissions_status on commissions(status);
create index if not exists idx_commissions_partner on commissions(partner_id) where partner_id is not null;
create index if not exists idx_commissions_deal on commissions(deal_id);

create table if not exists crm_automation_runs (
  id         uuid primary key default gen_random_uuid(),
  job_key    text not null,
  run_date   date not null,
  status     text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_key, run_date)
);

create index if not exists idx_crm_automation_runs_status on crm_automation_runs(status, run_date desc);

-- ── Referral Attributions ─────────────────────────────────────────────────────
create type entity_type_enum as enum ('buyer','owner');

create table if not exists referral_attributions (
  id            uuid primary key default gen_random_uuid(),
  referral_code text not null,
  lead_id       uuid not null references leads(id),
  partner_id    uuid references partners(id),
  entity_type   entity_type_enum not null,
  first_touch_at timestamptz not null default now(),
  converted     boolean not null default false,
  deal_id       uuid references deals(id)
);

create index if not exists idx_referral_code on referral_attributions(referral_code);

-- ── Buyer Demand ──────────────────────────────────────────────────────────────
create type demand_status_enum as enum ('active','matched','closed');

create table if not exists buyer_demand (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  province_id  uuid references provinces(id),
  land_type    land_type_enum,
  size_min_rai numeric(12,2),
  size_max_rai numeric(12,2),
  intended_use text,
  budget_note  text,
  status       demand_status_enum not null default 'active',
  is_public    boolean not null default true,
  seo_title    text,
  seo_description text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_buyer_demand_status on buyer_demand(status) where is_public=true;

-- ── Categories ────────────────────────────────────────────────────────────────
create type category_type_enum as enum ('blog','land');

create table if not exists categories (
  id        uuid primary key default gen_random_uuid(),
  name_th   text not null,
  slug      text not null unique,
  type      category_type_enum not null default 'blog',
  parent_id uuid references categories(id)
);

insert into categories (name_th, slug, type) values
  ('ที่ดินอุตสาหกรรม',       'that-din-utsahakam',      'blog'),
  ('EEC',                     'eec',                     'blog'),
  ('กฎหมาย-เอกสารสิทธิ์',    'kotmai-ekasan-sitti',     'blog'),
  ('ลงทุนที่ดิน',             'long-thun-that-din',      'blog'),
  ('ขายที่ดิน (สำหรับเจ้าของ)','khai-that-din-chao-kong', 'blog'),
  ('หาราย​ได้-พาร์ทเนอร์',    'ha-raidad-partner',       'blog'),
  ('ข่าวสาร-ตลาด',            'khao-san-talat',          'blog')
on conflict (slug) do nothing;

-- ── Blog Posts ────────────────────────────────────────────────────────────────
create type post_status_enum as enum ('draft','published');

create table if not exists blog_posts (
  id               uuid primary key default gen_random_uuid(),
  title_th         text not null,
  slug             text not null unique,
  excerpt          text,
  body             text,
  cover_image_key  text,
  category_id      uuid references categories(id),
  status           post_status_enum not null default 'draft',
  published_at     timestamptz,
  seo_title        text,
  seo_description  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_blog_posts_status on blog_posts(status, published_at desc);

-- ── Tags ──────────────────────────────────────────────────────────────────────
create table if not exists tags (
  id      uuid primary key default gen_random_uuid(),
  name_th text not null,
  slug    text not null unique
);

create table if not exists post_tags (
  post_id uuid not null references blog_posts(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- ── Events (lightweight analytics) ───────────────────────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,
  entity_type text,
  entity_id   uuid,
  session_id  text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_events_type on events(event_type, created_at desc);

-- ── Site Stats (single-row config / materialized) ─────────────────────────────
create table if not exists site_stats (
  id              int primary key default 1 check (id = 1),
  total_partners  int not null default 0,
  total_listings  int not null default 0,
  total_deals     int not null default 0,
  total_payout_mb numeric(10,1) not null default 0,
  updated_at      timestamptz not null default now()
);

insert into site_stats (id, total_partners, total_listings, total_deals, total_payout_mb)
values (1, 0, 0, 0, 0)
on conflict (id) do nothing;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Enable RLS on all tables; public read on safe tables only, service role writes all.

alter table provinces         enable row level security;
alter table lands             enable row level security;
alter table land_images       enable row level security;
alter table land_documents    enable row level security;
alter table leads             enable row level security;
alter table lead_attachments  enable row level security;
alter table lead_activities   enable row level security;
alter table partners          enable row level security;
alter table deals             enable row level security;
alter table commissions       enable row level security;
alter table crm_automation_runs enable row level security;
alter table referral_attributions enable row level security;
alter table buyer_demand      enable row level security;
alter table categories        enable row level security;
alter table blog_posts        enable row level security;
alter table tags              enable row level security;
alter table post_tags         enable row level security;
alter table events            enable row level security;
alter table site_stats        enable row level security;

-- Public read policies
create policy "public read provinces"     on provinces      for select using (true);
create policy "public read active lands"  on lands          for select using (status = 'active' and deleted_at is null);
create policy "public read land images"   on land_images    for select using (
  exists (
    select 1 from lands
    where lands.id = land_images.land_id
      and lands.status = 'active'
      and lands.deleted_at is null
  )
);
create policy "public read demands"       on buyer_demand   for select using (status = 'active' and is_public = true);
create policy "public read categories"    on categories     for select using (true);
create policy "public read blog posts"    on blog_posts     for select using (status = 'published');
create policy "public read tags"          on tags           for select using (true);
create policy "public read post_tags"     on post_tags      for select using (true);
create policy "public read site_stats"    on site_stats     for select using (true);

-- Events: anon insert for tracking, no read
create policy "anon insert events" on events for insert with check (true);
-- Leads: anon insert for form submissions, no read
create policy "anon insert leads" on leads for insert with check (true);
-- Lead attachments: anon insert
create policy "anon insert lead_attachments" on lead_attachments for insert with check (true);

-- All other access via service role (bypasses RLS).
