-- Search alerts are opt-in interest only; no delivery worker is installed here.
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  search_params text not null check (char_length(search_params) <= 4000),
  alert_requested boolean not null default false,
  alert_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_user_query_key unique (user_id, search_params),
  constraint saved_searches_alert_consent_check check (alert_requested = (alert_requested_at is not null))
);

alter table public.saved_searches enable row level security;
revoke all on table public.saved_searches from anon, authenticated;
grant select on table public.saved_searches to authenticated;
grant all on table public.saved_searches to service_role;
drop policy if exists "users read own saved searches" on public.saved_searches;
create policy "users read own saved searches" on public.saved_searches
  for select to authenticated using ((select auth.uid()) = user_id);

comment on column public.saved_searches.alert_requested is
  'Stored request for future search alerts only. Does not imply delivery is enabled or any notification was sent.';
