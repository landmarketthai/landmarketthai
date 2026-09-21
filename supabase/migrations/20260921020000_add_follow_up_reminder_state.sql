-- Internal reminder state for semi-automated CRM follow-up digests.
alter table leads
  add column if not exists last_reminded_at timestamptz;

create index if not exists idx_leads_follow_up_due
  on leads(next_action_at, last_reminded_at)
  where next_action_at is not null and status not in ('won','lost');
