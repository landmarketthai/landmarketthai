-- Idempotency ledger for internal CRM automation jobs.
create table if not exists crm_automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  run_date date not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_key, run_date)
);

create index if not exists idx_crm_automation_runs_status on crm_automation_runs(status, run_date desc);
alter table crm_automation_runs enable row level security;
-- No public policy; service-role/internal cron only.
