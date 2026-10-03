-- Staff operations only. Apply to a reviewed non-production database first.
begin;
alter table deals add column if not exists expected_commission numeric(18,2);
alter table deals add column if not exists stage text not null default 'qualified';
alter table deals add column if not exists updated_at timestamptz not null default now();
alter table referral_attributions add column if not exists deal_id uuid references deals(id);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid = 'deals'::regclass and conname = 'deals_partner_commission_nonnegative') then
    alter table deals add constraint deals_partner_commission_nonnegative check (
      (expected_commission is null or (expected_commission >= 0 and expected_commission <> 'NaN'::numeric)) and
      (commission_paid is null or (commission_paid >= 0 and commission_paid <> 'NaN'::numeric))
    );
  end if;
end $$;
-- Fail on historical duplicates rather than silently deleting staff records.
create unique index if not exists partners_one_per_lead on partners(lead_id) where lead_id is not null;
create index if not exists deals_partner_operations on deals(partner_id);
create index if not exists attributions_partner_operations on referral_attributions(partner_id);

create or replace function operations_partner_code(p_lead uuid, p_attempt integer default 0)
returns text language sql immutable strict as $$
  select 'LMT-' || upper(replace(p_lead::text, '-', '')) ||
    case when p_attempt = 0 then '' else '-' || p_attempt::text end
$$;

create or replace function operations_convert_partner(p_lead uuid, p_actor text)
returns partners language plpgsql as $$
declare l leads; p partners; attempt integer := 0;
begin
  select * into l from leads where id = p_lead for update;
  if not found then raise exception 'Partner lead not found' using errcode = 'P0002'; end if;
  if l.lead_type::text is distinct from 'partner' then raise exception 'Not a partner lead' using errcode = '22023'; end if;
  select * into p from partners where lead_id = p_lead;
  if found then return p; end if;
  loop
    insert into partners(lead_id, name, phone, line_id, referral_code, working_area, experience, network_size, status)
    values(l.id, l.name, l.phone, l.line_id, operations_partner_code(l.id, attempt),
      l.details->>'working_area', l.details->>'experience', l.details->>'network_size', 'active')
    on conflict (referral_code) do nothing returning * into p;
    exit when found;
    attempt := attempt + 1;
  end loop;
  -- Approval qualifies a partner lead; won remains a deal outcome.
  update leads set status = 'qualified', updated_at = now() where id = l.id;
  insert into events(event_type, entity_type, entity_id, meta)
  values('partner_converted', 'partner', p.id,
    jsonb_build_object('actor_id', p_actor, 'lead_id', l.id, 'referral_code', p.referral_code, 'lead_status', 'qualified'));
  return p;
end $$;

create or replace function operations_partner_status(p_id uuid, p_status text, p_actor text)
returns partners language plpgsql as $$
declare p partners; previous text;
begin
  if p_status not in ('active','inactive') or p_status is null then
    raise exception 'Invalid partner status' using errcode = '22023';
  end if;
  select * into p from partners where id = p_id for update;
  if not found then raise exception 'Partner not found' using errcode = 'P0002'; end if;
  previous := p.status;
  if previous = p_status then return p; end if;
  update partners set status = p_status, updated_at = now() where id = p_id returning * into p;
  insert into events(event_type, entity_type, entity_id, meta)
  values('partner_status_changed', 'partner', p.id,
    jsonb_build_object('actor_id', p_actor, 'previous', previous, 'status', p_status));
  return p;
end $$;

-- Recompute, never increment. Covers pipeline reassignment/deletion as well as staff payments.
create or replace function operations_sync_partner_paid() returns trigger language plpgsql as $$
declare old_partner uuid; new_partner uuid;
begin
  if TG_OP <> 'INSERT' then old_partner := OLD.partner_id; end if;
  if TG_OP <> 'DELETE' then new_partner := NEW.partner_id; end if;
  -- Stable lock order for reassignment; separate statement gives a fresh snapshot after waiting.
  perform id from partners where id in (old_partner, new_partner) order by id for update;
  update partners p set total_paid = coalesce((select sum(d.commission_paid) from deals d where d.partner_id = p.id), 0),
    updated_at = now() where p.id in (old_partner, new_partner);
  return null;
end $$;
drop trigger if exists operations_sync_partner_paid on deals;
create trigger operations_sync_partner_paid after insert or update of commission_paid, partner_id or delete on deals
for each row execute function operations_sync_partner_paid();
update partners p set total_paid = coalesce((select sum(d.commission_paid) from deals d where d.partner_id = p.id), 0);

create or replace function operations_deal_commission(p_id uuid, p_expected numeric, p_paid numeric, p_override boolean, p_actor text)
returns deals language plpgsql as $$
declare d deals; previous_expected numeric; previous_paid numeric; exceeded boolean;
begin
  if p_paid is null or p_paid < 0 or p_expected < 0 or
    p_paid::text in ('NaN','Infinity','-Infinity') or p_expected::text in ('NaN','Infinity','-Infinity') or
    p_paid <> round(p_paid, 2) or p_expected <> round(p_expected, 2) or
    p_paid >= 10000000000000000 or p_expected >= 10000000000000000 then
    raise exception 'Invalid commission amount' using errcode = '22023';
  end if;
  exceeded := p_expected is not null and p_paid > p_expected;
  if exceeded and not coalesce(p_override, false) then
    raise exception 'Paid commission exceeds expected commission' using errcode = '22023';
  end if;
  select * into d from deals where id = p_id for update;
  if not found then raise exception 'Deal not found' using errcode = 'P0002'; end if;
  previous_expected := d.expected_commission; previous_paid := d.commission_paid;
  -- A retry is a no-op (including its event). Null paid and zero paid remain distinct.
  if d.expected_commission is not distinct from p_expected and d.commission_paid is not distinct from p_paid then return d; end if;
  update deals set expected_commission = p_expected, commission_paid = p_paid, updated_at = now()
    where id = p_id returning * into d;
  insert into events(event_type, entity_type, entity_id, meta)
  values('deal_commission_changed', 'deal', d.id, jsonb_build_object(
    'actor_id', p_actor, 'partner_id', d.partner_id, 'previous_expected', previous_expected,
    'previous_paid', previous_paid, 'expected_commission', p_expected, 'commission_paid', p_paid,
    'override', coalesce(p_override, false), 'exceeded_expected', exceeded));
  return d;
end $$;
-- Invoker rights; functions are callable only by the backend database role, not public roles.
revoke all on function operations_convert_partner(uuid,text) from public;
revoke all on function operations_partner_status(uuid,text,text) from public;
revoke all on function operations_deal_commission(uuid,numeric,numeric,boolean,text) from public;
commit;
