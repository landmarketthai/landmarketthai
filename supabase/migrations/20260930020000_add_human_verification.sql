-- Verification is an explicit admin decision, independent of publication/referrals.
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 150),
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  constraint agents_verification_pair check ((verified_at is null) = (verified_by is null))
);

alter table public.lands add column if not exists agent_id uuid references public.agents(id) on delete set null;
alter table public.lands add column if not exists verified_at timestamptz;
alter table public.lands add column if not exists verified_by uuid;
alter table public.lands drop constraint if exists lands_verification_pair;
alter table public.lands add constraint lands_verification_pair check ((verified_at is null) = (verified_by is null));
create index if not exists idx_lands_agent on public.lands(agent_id);

alter table public.agents enable row level security;
revoke all on table public.agents from anon, authenticated;
grant select on table public.agents to anon, authenticated;
grant all on table public.agents to service_role;
drop policy if exists "public read agent identities" on public.agents;
create policy "public read agent identities" on public.agents for select to anon, authenticated using (true);
-- No public insert/update path can forge a verification badge.
revoke insert, update, delete on table public.lands from anon, authenticated;

-- A verified snapshot cannot survive edits to the facts that were reviewed.
create or replace function public.clear_changed_property_verification()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.title_th, new.province_id, new.district, new.land_type, new.size_rai,
         new.zoning, new.frontage_m, new.price_per_rai, new.is_eec, new.description,
         new.nearby_landmarks, new.lat, new.lng, new.location_precision)
     is distinct from
     row(old.title_th, old.province_id, old.district, old.land_type, old.size_rai,
         old.zoning, old.frontage_m, old.price_per_rai, old.is_eec, old.description,
         old.nearby_landmarks, old.lat, old.lng, old.location_precision) then
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_changed_property_verification() from public, anon, authenticated;
grant execute on function public.clear_changed_property_verification() to service_role;
drop trigger if exists clear_changed_property_verification on public.lands;
create trigger clear_changed_property_verification before update on public.lands
for each row execute function public.clear_changed_property_verification();
