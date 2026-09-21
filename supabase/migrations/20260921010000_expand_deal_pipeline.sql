-- Expand the existing deals table into a human-controlled sales pipeline.
-- Keeps legacy status for compatibility while adding a finer stage and seed-listing support.

alter table deals
  alter column land_id drop not null,
  alter column deal_value drop not null;

alter table deals
  add column if not exists listing_ref text,
  add column if not exists listing_title text,
  add column if not exists stage text not null default 'qualified'
    check (stage in ('qualified','property_sent','site_visit','negotiation','offer','deposit','won','lost')),
  add column if not exists assigned_to text,
  add column if not exists expected_commission numeric(18,2),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_deals_stage on deals(stage);
create index if not exists idx_deals_buyer_lead on deals(buyer_lead_id) where buyer_lead_id is not null;
create index if not exists idx_deals_listing_ref on deals(listing_ref) where listing_ref is not null;

create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  source_lead_id uuid references leads(id) on delete set null,
  source_type text not null check (source_type in ('buyer','owner')),
  partner_id uuid references partners(id) on delete set null,
  referral_code text,
  amount_estimated numeric(18,2),
  amount_approved numeric(18,2),
  amount_paid numeric(18,2) not null default 0,
  status text not null default 'estimated'
    check (status in ('estimated','approved','payable','paid','cancelled')),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id, source_type, source_lead_id)
);

create index if not exists idx_commissions_status on commissions(status);
create index if not exists idx_commissions_partner on commissions(partner_id) where partner_id is not null;
create index if not exists idx_commissions_deal on commissions(deal_id);

alter table commissions enable row level security;
-- No public policy: all deal and commission operations remain service-role/admin only.
