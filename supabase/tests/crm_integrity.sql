-- CRM database integration smoke test.
-- Run only on a non-production database. All test data is rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_province uuid;
  v_owner uuid;
  v_land uuid;
  v_land_again uuid;
  v_buyer uuid;
  v_deal uuid;
  v_deal_again uuid;
  v_partner_lead uuid;
  v_partner uuid;
  v_buyer_ref uuid;
  v_deal_ref uuid;
  v_commission uuid;
  v_follow uuid;
  v_claim uuid;
  v_old_claim uuid := gen_random_uuid();
  v_new_claim uuid;
  v_created boolean;
  v_created_again boolean;
  v_failed boolean;
  v_count integer;
  v_amount numeric;
  v_status lead_status_enum;
  v_last_reminded timestamptz;
  v_next_action timestamptz;
begin
  select id into v_province from provinces order by created_at asc limit 1;
  if v_province is null then raise exception 'audit requires at least one province'; end if;

  -- Owner Lead -> Draft Property must be atomic and idempotent.
  insert into leads(lead_type, name, phone, status, consent_pdpa)
  values ('owner', 'Audit Owner', '0800000001', 'new', true)
  returning id into v_owner;

  select r.land_id, r.created into v_land, v_created
  from create_property_draft_from_owner_lead(
    v_owner, v_province, 'Audit Property', 'audit-property', null,
    'industrial', 10, null, 1000000, 50000, false, 'audit@example.com'
  ) r;

  if v_land is null or not v_created then raise exception 'owner draft was not created'; end if;

  select status into v_status from leads where id = v_owner;
  if v_status <> 'qualified' then raise exception 'owner lead was not qualified atomically'; end if;

  select count(*) into v_count
  from lead_activities
  where lead_id = v_owner and note = 'สร้าง Draft Property: Audit Property';
  if v_count <> 1 then raise exception 'owner draft activity was not written atomically'; end if;

  select r.land_id, r.created into v_land_again, v_created_again
  from create_property_draft_from_owner_lead(
    v_owner, v_province, 'Audit Property', 'audit-property', null,
    'industrial', 10, null, 1000000, 50000, false, 'audit@example.com'
  ) r;
  if v_created_again or v_land_again <> v_land then raise exception 'owner draft idempotency failed'; end if;

  -- A buyer/property pair must not create duplicate deals.
  insert into leads(lead_type, name, phone, status, consent_pdpa)
  values ('buyer', 'Audit Buyer', '0800000002', 'qualified', true)
  returning id into v_buyer;

  select r.deal_id, r.created into v_deal, v_created
  from create_deal_with_commissions(
    v_buyer, v_land, 'audit-property', 'Audit Property', null, null, '[]'::jsonb
  ) r;
  if v_deal is null or not v_created then raise exception 'deal was not created'; end if;

  select r.deal_id, r.created into v_deal_again, v_created_again
  from create_deal_with_commissions(
    v_buyer, v_land, 'audit-property', 'Audit Property', null, null, '[]'::jsonb
  ) r;
  if v_created_again or v_deal_again <> v_deal then raise exception 'deal dedupe failed'; end if;

  -- Commission payout rules and totals must update in one transaction.
  insert into leads(lead_type, name, phone, status, consent_pdpa)
  values ('partner', 'Audit Partner', '0800000003', 'qualified', true)
  returning id into v_partner_lead;

  insert into partners(lead_id, name, phone, referral_code, status)
  values (v_partner_lead, 'Audit Partner', '0800000003', 'AUDITREF', 'active')
  returning id into v_partner;

  insert into leads(lead_type, name, phone, status, consent_pdpa, referral_code)
  values ('buyer', 'Audit Referred Buyer', '0800000004', 'qualified', true, 'AUDITREF')
  returning id into v_buyer_ref;

  select r.deal_id, r.created into v_deal_ref, v_created
  from create_deal_with_commissions(
    v_buyer_ref,
    null,
    'audit-seed-listing',
    'Audit Seed Listing',
    1000,
    null,
    jsonb_build_array(jsonb_build_object(
      'source_lead_id', v_buyer_ref,
      'source_type', 'buyer',
      'partner_id', v_partner,
      'referral_code', 'AUDITREF'
    ))
  ) r;
  if not v_created then raise exception 'referred deal was not created'; end if;

  select id into v_commission from commissions where deal_id = v_deal_ref;
  if v_commission is null then raise exception 'commission was not created atomically with deal'; end if;

  v_failed := false;
  begin
    perform update_commission_atomic(v_commission, 'payable', 1000, 0);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'commission became payable before won'; end if;

  perform update_deal_stage_atomic(v_deal_ref, 'won', 1000000, null, null);
  perform update_commission_atomic(v_commission, 'paid', 1000, 1000);

  select commission_paid into v_amount from deals where id = v_deal_ref;
  if v_amount <> 1000 then raise exception 'deal commission total is incorrect: %', v_amount; end if;

  select total_paid into v_amount from partners where id = v_partner;
  if v_amount <> 1000 then raise exception 'partner paid total is incorrect: %', v_amount; end if;

  -- A stale daily automation claim can recover; a fresh running claim cannot be stolen.
  insert into crm_automation_runs(job_key, run_date, status, claim_token, claimed_at)
  values ('audit_stale', date '2099-01-01', 'running', v_old_claim, now() - interval '20 minutes');

  select r.run_claim_token into v_new_claim
  from claim_crm_automation_run('audit_stale', date '2099-01-01') r;
  if v_new_claim is null or v_new_claim = v_old_claim then raise exception 'stale automation claim was not recovered'; end if;

  insert into crm_automation_runs(job_key, run_date, status, claim_token, claimed_at)
  values ('audit_fresh', date '2099-01-02', 'running', gen_random_uuid(), now());
  select count(*) into v_count from claim_crm_automation_run('audit_fresh', date '2099-01-02');
  if v_count <> 0 then raise exception 'fresh automation claim was stolen'; end if;

  -- Follow-up work is claimed once and becomes non-due after successful delivery.
  insert into leads(lead_type, name, phone, status, consent_pdpa, next_action_at)
  values ('buyer', 'Audit Follow Up', '0800000005', 'new', true, now() - interval '1 minute')
  returning id, next_action_at into v_follow, v_next_action;

  select r.claim_token into v_claim
  from claim_due_follow_up_leads(200, 300) r
  where r.id = v_follow;
  if v_claim is null then raise exception 'due follow-up was not claimed'; end if;

  select count(*) into v_count
  from claim_due_follow_up_leads(200, 300) r
  where r.id = v_follow;
  if v_count <> 0 then raise exception 'follow-up was claimed twice'; end if;

  if finish_follow_up_claim(v_claim, true) <> 1 then raise exception 'follow-up claim was not finalized'; end if;

  select last_reminded_at into v_last_reminded from leads where id = v_follow;
  if v_last_reminded is distinct from v_next_action then raise exception 'follow-up reminder state is incorrect'; end if;

  select count(*) into v_count
  from claim_due_follow_up_leads(200, 300) r
  where r.id = v_follow;
  if v_count <> 0 then raise exception 'delivered follow-up became due again'; end if;

  -- Direct public writes must stay closed; all forms go through validated server endpoints.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in ('anon insert leads', 'anon insert lead_attachments', 'anon insert events');
  if v_count <> 0 then raise exception 'unsafe anon insert policy still exists'; end if;

  if has_table_privilege('anon', 'leads', 'INSERT') then raise exception 'anon can insert leads directly'; end if;
  if has_table_privilege('authenticated', 'leads', 'INSERT') then raise exception 'authenticated can insert leads directly'; end if;
end $$;

rollback;
