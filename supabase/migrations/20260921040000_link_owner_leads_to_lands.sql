-- Link accepted owner leads to canonical land records so owner-side referrals
-- can remain attributable through matching, deal closing and commission review.
alter table lands
  add column if not exists owner_lead_id uuid references leads(id) on delete set null;

create unique index if not exists idx_lands_owner_lead_unique
  on lands(owner_lead_id)
  where owner_lead_id is not null;
