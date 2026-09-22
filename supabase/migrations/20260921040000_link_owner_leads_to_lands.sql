-- Link accepted owner leads to canonical land records so owner-side referrals
-- can remain attributable through matching, deal closing and commission review.
-- This incremental migration expects the schema baseline to exist first.
do $$
begin
  if to_regclass('public.lands') is null or to_regclass('public.leads') is null then
    raise exception 'Owner lead/property migration requires the LandmarketThai schema baseline';
  end if;
end $$;

alter table lands
  add column if not exists owner_lead_id uuid references leads(id) on delete set null;

create unique index if not exists idx_lands_owner_lead_unique
  on lands(owner_lead_id)
  where owner_lead_id is not null;
