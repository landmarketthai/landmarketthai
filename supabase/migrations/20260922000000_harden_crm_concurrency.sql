-- Pre-merge CRM hardening: concurrency-safe automation, deal uniqueness,
-- and atomic financial state changes.

-- Fail clearly if this incremental migration is applied without the schema baseline.
do $$
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.deals') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.commissions') is null
     or to_regclass('public.crm_automation_runs') is null then
    raise exception 'CRM hardening requires the LandmarketThai schema baseline and prior CRM migrations';
  end if;
end $$;

-- Refuse to hide pre-existing duplicate deals. Operators must review them before
-- the uniqueness guard can be installed.
do $$
begin
  if exists (
    select 1
    from deals
    where buyer_lead_id is not null and land_id is not null
    group by buyer_lead_id, land_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate buyer/land deals exist; review them before applying CRM hardening';
  end if;

  if exists (
    select 1
    from deals
    where buyer_lead_id is not null and listing_ref is not null
    group by buyer_lead_id, listing_ref
    having count(*) > 1
  ) then
    raise exception 'Duplicate buyer/listing_ref deals exist; review them before applying CRM hardening';
  end if;
end $$;

create unique index if not exists uq_deals_buyer_land
  on deals(buyer_lead_id, land_id)
  where buyer_lead_id is not null and land_id is not null;

create unique index if not exists uq_deals_buyer_listing_ref
  on deals(buyer_lead_id, listing_ref)
  where buyer_lead_id is not null and listing_ref is not null;

-- Claim state for follow-up workers. The claimed schedule is stored separately so
-- changing next_action_at while a webhook is in flight does not suppress the new reminder.
alter table leads
  add column if not exists reminder_claim_token uuid,
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_claimed_for timestamptz;

create index if not exists idx_leads_reminder_claim
  on leads(reminder_claimed_at)
  where reminder_claim_token is not null;

-- Daily automation row ownership. "running" is a real state so a second worker
-- cannot reuse a pending row while the first worker is delivering it.
alter table crm_automation_runs
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz;

alter table crm_automation_runs
  drop constraint if exists crm_automation_runs_status_check;

alter table crm_automation_runs
  add constraint crm_automation_runs_status_check
  check (status in ('pending','running','sent','failed'));

create or replace function claim_crm_automation_run(
  p_job_key text,
  p_run_date date
)
returns table(run_id uuid, run_claim_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_id uuid;
begin
  insert into crm_automation_runs(job_key, run_date, status, updated_at)
  values (p_job_key, p_run_date, 'pending', now())
  on conflict (job_key, run_date) do nothing;

  update crm_automation_runs
  set status = 'running',
      claim_token = v_token,
      claimed_at = now(),
      updated_at = now()
  where job_key = p_job_key
    and run_date = p_run_date
    and (
      status in ('pending','failed')
      or (status = 'running' and (claimed_at is null or claimed_at < now() - interval '15 minutes'))
    )
  returning id into v_id;

  if v_id is null then
    return;
  end if;

  return query select v_id, v_token;
end;
$$;

create or replace function finish_crm_automation_run(
  p_run_id uuid,
  p_claim_token uuid,
  p_success boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update crm_automation_runs
  set status = case when p_success then 'sent' else 'failed' end,
      sent_at = case when p_success then now() else null end,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  where id = p_run_id
    and claim_token = p_claim_token
    and status = 'running';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function claim_due_follow_up_leads(
  p_limit integer default 200,
  p_claim_lease_seconds integer default 300
)
returns table(
  id uuid,
  name text,
  phone text,
  lead_type lead_type_enum,
  status lead_status_enum,
  assigned_to text,
  next_action_at timestamptz,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_lease interval := make_interval(secs => greatest(coalesce(p_claim_lease_seconds, 300), 30));
begin
  return query
  with candidates as (
    select l.id
    from leads l
    where l.status in ('new','contacting','qualified')
      and l.next_action_at is not null
      and l.next_action_at <= now()
      and (l.last_reminded_at is null or l.last_reminded_at < l.next_action_at)
      and (
        l.reminder_claim_token is null
        or l.reminder_claimed_at is null
        or l.reminder_claimed_at < now() - v_lease
      )
    order by l.next_action_at asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update leads l
    set reminder_claim_token = v_token,
        reminder_claimed_at = now(),
        reminder_claimed_for = l.next_action_at
    from candidates c
    where l.id = c.id
    returning l.id, l.name, l.phone, l.lead_type, l.status,
              l.assigned_to, l.next_action_at, l.reminder_claim_token
  )
  select claimed.id, claimed.name, claimed.phone, claimed.lead_type,
         claimed.status, claimed.assigned_to, claimed.next_action_at,
         claimed.reminder_claim_token
  from claimed;
end;
$$;

create or replace function finish_follow_up_claim(
  p_claim_token uuid,
  p_delivered boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_delivered then
    update leads
    set last_reminded_at = reminder_claimed_for,
        reminder_claim_token = null,
        reminder_claimed_at = null,
        reminder_claimed_for = null
    where reminder_claim_token = p_claim_token;
  else
    update leads
    set reminder_claim_token = null,
        reminder_claimed_at = null,
        reminder_claimed_for = null
    where reminder_claim_token = p_claim_token;
  end if;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Atomic Deal + Commission creation. Unique indexes above are the final guard
-- against double-clicks and concurrent requests.
create or replace function create_deal_with_commissions(
  p_buyer_lead_id uuid,
  p_land_id uuid,
  p_listing_ref text,
  p_listing_title text,
  p_expected_commission numeric,
  p_assigned_to text,
  p_referral_sources jsonb default '[]'::jsonb
)
returns table(deal_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal_id uuid;
  v_primary_partner uuid;
  v_primary_referral text;
  v_commission_estimate numeric;
begin
  if p_buyer_lead_id is null then
    raise exception 'buyer lead is required';
  end if;
  if p_land_id is null and nullif(btrim(p_listing_ref), '') is null then
    raise exception 'property reference is required';
  end if;
  if jsonb_typeof(coalesce(p_referral_sources, '[]'::jsonb)) <> 'array' then
    raise exception 'referral sources must be a JSON array';
  end if;

  if jsonb_array_length(coalesce(p_referral_sources, '[]'::jsonb)) > 0 then
    v_primary_referral := nullif(p_referral_sources->0->>'referral_code', '');
    if nullif(p_referral_sources->0->>'partner_id', '') is not null then
      v_primary_partner := (p_referral_sources->0->>'partner_id')::uuid;
    end if;
  end if;

  v_commission_estimate := case
    when jsonb_array_length(coalesce(p_referral_sources, '[]'::jsonb)) = 1 then p_expected_commission
    else null
  end;

  begin
    insert into deals(
      land_id, listing_ref, listing_title, buyer_lead_id, partner_id,
      referral_code, deal_value, commission_paid, expected_commission,
      status, stage, assigned_to, notes, updated_at
    ) values (
      p_land_id, nullif(btrim(p_listing_ref), ''), p_listing_title,
      p_buyer_lead_id, v_primary_partner, v_primary_referral,
      null, null,
      case when jsonb_array_length(coalesce(p_referral_sources, '[]'::jsonb)) > 0
           then p_expected_commission else null end,
      'in_progress', 'qualified', p_assigned_to, null, now()
    ) returning id into v_deal_id;
  exception when unique_violation then
    if p_land_id is not null then
      select d.id into v_deal_id
      from deals d
      where d.buyer_lead_id = p_buyer_lead_id and d.land_id = p_land_id
      order by d.created_at asc
      limit 1;
    else
      select d.id into v_deal_id
      from deals d
      where d.buyer_lead_id = p_buyer_lead_id
        and d.listing_ref = nullif(btrim(p_listing_ref), '')
      order by d.created_at asc
      limit 1;
    end if;

    if v_deal_id is null then
      raise;
    end if;

    return query select v_deal_id, false;
    return;
  end;

  if jsonb_array_length(coalesce(p_referral_sources, '[]'::jsonb)) > 0 then
    insert into commissions(
      deal_id, source_lead_id, source_type, partner_id, referral_code,
      amount_estimated, status, amount_paid
    )
    select
      v_deal_id,
      (item->>'source_lead_id')::uuid,
      item->>'source_type',
      case when nullif(item->>'partner_id', '') is null then null else (item->>'partner_id')::uuid end,
      nullif(item->>'referral_code', ''),
      v_commission_estimate,
      'estimated',
      0
    from jsonb_array_elements(p_referral_sources) as item;
  end if;

  return query select v_deal_id, true;
end;
$$;

-- Atomic Deal stage mutation plus financial cancellation when a Deal is lost.
create or replace function update_deal_stage_atomic(
  p_deal_id uuid,
  p_stage text,
  p_deal_value numeric,
  p_assigned_to text,
  p_notes text
)
returns table(buyer_lead_id uuid, land_id uuid, previous_stage text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal deals%rowtype;
  v_now timestamptz := now();
begin
  if p_stage not in ('qualified','property_sent','site_visit','negotiation','offer','deposit','won','lost') then
    raise exception 'invalid deal stage';
  end if;
  if p_stage = 'won' and (p_deal_value is null or p_deal_value <= 0) then
    raise exception 'deal value is required before marking a deal as won';
  end if;

  select * into v_deal from deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;

  update deals
  set stage = p_stage,
      status = case when p_stage = 'won' then 'closed'::deal_status_enum when p_stage = 'lost' then 'cancelled'::deal_status_enum else 'in_progress'::deal_status_enum end,
      deal_value = p_deal_value,
      assigned_to = p_assigned_to,
      notes = p_notes,
      closed_at = case when p_stage in ('won','lost') then v_now else null end,
      updated_at = v_now
  where id = p_deal_id;

  if p_stage = 'lost' then
    update commissions
    set status = 'cancelled',
        amount_paid = 0,
        paid_at = null,
        updated_at = v_now
    where deal_id = p_deal_id and status <> 'paid';
  end if;

  return query select v_deal.buyer_lead_id, v_deal.land_id, v_deal.stage;
end;
$$;

-- Atomic commission mutation + derived Deal/Partner totals.
create or replace function update_commission_atomic(
  p_commission_id uuid,
  p_status text,
  p_amount_approved numeric,
  p_amount_paid numeric
)
returns table(deal_id uuid, partner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission commissions%rowtype;
  v_deal_stage text;
  v_now timestamptz := now();
begin
  if p_status not in ('estimated','approved','payable','paid','cancelled') then
    raise exception 'invalid commission status';
  end if;
  if p_amount_approved is not null and p_amount_approved < 0 then
    raise exception 'approved amount cannot be negative';
  end if;
  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'paid amount cannot be negative';
  end if;
  if p_status in ('approved','payable','paid') and p_amount_approved is null then
    raise exception 'approved amount is required';
  end if;
  if p_status = 'paid' and coalesce(p_amount_paid, 0) <= 0 then
    raise exception 'paid amount is required';
  end if;
  if p_status = 'paid' and p_amount_approved is not null and p_amount_paid > p_amount_approved then
    raise exception 'paid amount cannot exceed approved amount';
  end if;

  select * into v_commission
  from commissions
  where id = p_commission_id
  for update;

  if not found then
    raise exception 'commission not found';
  end if;

  select stage into v_deal_stage
  from deals
  where id = v_commission.deal_id
  for update;

  if not found then
    raise exception 'deal not found';
  end if;

  if p_status in ('payable','paid') and v_deal_stage <> 'won' then
    raise exception 'commission can only become payable or paid after deal is won';
  end if;

  update commissions
  set status = p_status,
      amount_approved = p_amount_approved,
      amount_paid = case when p_status = 'paid' then coalesce(p_amount_paid, 0) else 0 end,
      approved_at = case when p_status in ('approved','payable','paid') then v_now else null end,
      paid_at = case when p_status = 'paid' then v_now else null end,
      updated_at = v_now
  where id = p_commission_id;

  update deals
  set commission_paid = (
        select coalesce(sum(c.amount_paid), 0)
        from commissions c
        where c.deal_id = v_commission.deal_id and c.status = 'paid'
      ),
      updated_at = v_now
  where id = v_commission.deal_id;

  if v_commission.partner_id is not null then
    perform 1 from partners where id = v_commission.partner_id for update;
    update partners
    set total_paid = (
          select coalesce(sum(c.amount_paid), 0)
          from commissions c
          where c.partner_id = v_commission.partner_id and c.status = 'paid'
        ),
        updated_at = v_now
    where id = v_commission.partner_id;
  end if;

  return query select v_commission.deal_id, v_commission.partner_id;
end;
$$;

-- Restrict operational RPCs to the server-side service role.
revoke all on function claim_crm_automation_run(text, date) from public, anon, authenticated;
revoke all on function finish_crm_automation_run(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function claim_due_follow_up_leads(integer, integer) from public, anon, authenticated;
revoke all on function finish_follow_up_claim(uuid, boolean) from public, anon, authenticated;
revoke all on function create_deal_with_commissions(uuid, uuid, text, text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function update_deal_stage_atomic(uuid, text, numeric, text, text) from public, anon, authenticated;
revoke all on function update_commission_atomic(uuid, text, numeric, numeric) from public, anon, authenticated;

grant execute on function claim_crm_automation_run(text, date) to service_role;
grant execute on function finish_crm_automation_run(uuid, uuid, boolean) to service_role;
grant execute on function claim_due_follow_up_leads(integer, integer) to service_role;
grant execute on function finish_follow_up_claim(uuid, boolean) to service_role;
grant execute on function create_deal_with_commissions(uuid, uuid, text, text, numeric, text, jsonb) to service_role;
grant execute on function update_deal_stage_atomic(uuid, text, numeric, text, text) to service_role;
grant execute on function update_commission_atomic(uuid, text, numeric, numeric) to service_role;
