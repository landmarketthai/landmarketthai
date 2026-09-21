-- Lead CRM follow-up foundation.
-- Private/admin-only data: service-role access only, no public RLS policy.

alter table leads
  add column if not exists next_action_at timestamptz;

create index if not exists idx_leads_next_action
  on leads(next_action_at)
  where next_action_at is not null;

create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  activity_type text not null default 'note'
    check (activity_type in ('note', 'call', 'line', 'site_visit', 'other')),
  note text not null check (char_length(note) between 1 and 2000),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead_created
  on lead_activities(lead_id, created_at desc);

alter table lead_activities enable row level security;
