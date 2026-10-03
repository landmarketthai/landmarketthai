-- Marketplace Operations V1: lead reminders + deal pipeline.
-- Idempotent and non-destructive. Safe to rerun against any DB state from a
-- fresh older base through a DB that already carries these columns.
-- No table is dropped and no row is deleted by this migration.

begin;

-- ── Leads: reminder scheduling ──────────────────────────────────────────────
alter table leads
  add column if not exists next_action_at timestamptz,
  add column if not exists last_reminded_at timestamptz,
  add column if not exists reminder_claim_token uuid,
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_claimed_for timestamptz;

create index if not exists idx_leads_next_action
  on leads (next_action_at) where next_action_at is not null;
create index if not exists idx_leads_reminder_claim
  on leads (reminder_claim_token) where reminder_claim_token is not null;

-- ── Deals: pipeline table, created if a fresh DB does not have it yet ──────
create table if not exists deals (
  id              uuid primary key default gen_random_uuid(),
  land_id         uuid references lands(id),
  buyer_lead_id   uuid references leads(id),
  partner_id      uuid references partners(id),
  referral_code   text,
  deal_value      numeric(18,2),
  commission_paid numeric(18,2),
  status          text not null default 'in_progress',
  closed_at       timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

-- A pre-existing base (supabase/schema.sql) made these NOT NULL. Relax only if needed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'deals'
      and column_name = 'land_id' and is_nullable = 'NO'
  ) then
    alter table deals alter column land_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'deals'
      and column_name = 'deal_value' and is_nullable = 'NO'
  ) then
    alter table deals alter column deal_value drop not null;
  end if;
end $$;

alter table deals
  add column if not exists listing_ref text,
  add column if not exists listing_title text,
  add column if not exists expected_commission numeric(18,2),
  add column if not exists stage text default 'qualified',
  add column if not exists assigned_to text,
  add column if not exists updated_at timestamptz not null default now();

alter table deals alter column stage set default 'qualified';

-- Backfill only the column this migration just introduced; never touch existing status.
update deals set stage = 'qualified' where stage is null;

alter table deals drop constraint if exists deals_stage_check;
alter table deals add constraint deals_stage_check
  check (stage in ('qualified', 'property_sent', 'site_visit', 'negotiation', 'offer', 'deposit', 'won', 'lost'))
  not valid;
alter table deals validate constraint deals_stage_check;

create index if not exists idx_deals_stage on deals (stage);
create index if not exists idx_deals_buyer_lead
  on deals (buyer_lead_id) where buyer_lead_id is not null;
create index if not exists idx_deals_listing_ref
  on deals (listing_ref) where listing_ref is not null;
create unique index if not exists idx_deals_buyer_lead_land_unique
  on deals (buyer_lead_id, land_id)
  where buyer_lead_id is not null and land_id is not null;
create unique index if not exists idx_deals_buyer_lead_listing_ref_unique
  on deals (buyer_lead_id, listing_ref)
  where buyer_lead_id is not null and listing_ref is not null;

-- ── Partners / referral_attributions: schema untouched, indexes only ──────
create index if not exists idx_partners_status on partners (status);
create index if not exists idx_referral_attributions_lead on referral_attributions (lead_id);
create index if not exists idx_referral_attributions_partner
  on referral_attributions (partner_id) where partner_id is not null;

-- No updated_at trigger: the repo has no shared set_updated_at()/moddatetime
-- helper (checked across db/migrations and supabase/migrations), so none is
-- added here rather than inventing a new global function.

commit;
