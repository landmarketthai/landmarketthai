-- Runs after the fixture and migration in a disposable local database. All test writes roll back.
begin;
do $$
declare l uuid := gen_random_uuid(); buyer uuid := gen_random_uuid(); p partners; retry partners;
  d uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); other uuid := gen_random_uuid(); count_before integer;
begin
  insert into leads(id,lead_type,name,phone,line_id,details) values(l,'partner','Test partner','0812345678','line-test',
    '{"working_area":"Bangkok","experience":"1-3y","network_size":"small"}');
  insert into leads(id,lead_type,name,phone) values(buyer,'buyer','Buyer','0812345678');
  -- Exercise a real collision on the first candidate.
  insert into partners(id,name,phone,referral_code) values(other,'Existing','0812345678',operations_partner_code(l));
  p := operations_convert_partner(l,'staff');
  retry := operations_convert_partner(l,'staff');
  assert p.id = retry.id, 'Conversion retry created duplicate';
  assert p.referral_code = operations_partner_code(l,1), 'Collision fallback failed';
  assert p.status = 'active' and p.working_area = 'Bangkok' and p.line_id = 'line-test', 'Lead details not copied';
  assert (select status = 'qualified' from leads where id = l), 'Approval must qualify lead';
  assert (select count(*) = 1 from events where event_type = 'partner_converted' and entity_id = p.id), 'Retry emitted duplicate event';
  begin
    perform operations_convert_partner(buyer,'staff');
    raise exception 'Buyer conversion accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into partners(lead_id,name,phone,referral_code) values(l,'Duplicate','0812345678','duplicate');
    raise exception 'Duplicate lead accepted';
  exception when unique_violation then null; end;
  insert into deals(id,partner_id,stage,status,expected_commission,commission_paid) values(d,p.id,'won','closed',100,0),(d2,p.id,'qualified','in_progress',200,5);
  begin
    update deals set commission_paid = -1 where id = d;
    raise exception 'Direct negative payment accepted';
  exception when check_violation then null; end;
  perform operations_deal_commission(d,100,25,false,'staff',(select updated_at from deals where id = d));
  assert (select total_paid = 30 from partners where id = p.id), 'Total is not sum of cumulative payments';
  select count(*) into count_before from events;
  perform operations_deal_commission(d,100,25,false,'staff',(select updated_at from deals where id = d));
  assert (select total_paid = 30 from partners where id = p.id), 'Retry double counted';
  assert (select count(*) = count_before from events), 'Retry duplicated event';
  begin
    perform operations_deal_commission(d,100,101,false,'staff',(select updated_at from deals where id = d));
    raise exception 'Excess payment accepted without override';
  exception when invalid_parameter_value then null; end;
  begin
    perform operations_deal_commission(d,-1,0,false,'staff',(select updated_at from deals where id = d));
    raise exception 'Negative expected accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform operations_deal_commission(d,100,-1,false,'staff',(select updated_at from deals where id = d));
    raise exception 'Negative paid accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform operations_deal_commission(d,100,1.001,false,'staff',(select updated_at from deals where id = d));
    raise exception 'Fractional cents accepted';
  exception when invalid_parameter_value then null; end;
  perform operations_deal_commission(d,100,101,true,'staff',(select updated_at from deals where id = d));
  assert (select total_paid = 106 from partners where id = p.id), 'Override total incorrect';
  assert exists(select 1 from events where entity_id = d and meta->>'override' = 'true'
    and meta->>'exceeded_expected' = 'true' and meta->>'actor_id' = 'staff'), 'Override audit missing';
  perform operations_deal_commission(d,null,101,false,'staff',(select updated_at from deals where id = d));
  update deals set partner_id = other where id = d;
  assert (select total_paid = 5 from partners where id = p.id), 'Old partner total after reassignment incorrect';
  assert (select total_paid = 101 from partners where id = other), 'New partner total after reassignment incorrect';
  delete from deals where id = d;
  assert (select total_paid = 0 from partners where id = other), 'Deleted payment still counted';
  -- Audit failure must roll back both payment and trigger-derived total.
  alter table events add constraint operations_test_event_failure check(event_type <> 'deal_commission_changed') not valid;
  begin
    perform operations_deal_commission(d2,200,10,false,'staff',(select updated_at from deals where id = d2));
    raise exception 'Audit failure did not abort commission mutation';
  exception when check_violation then null; end;
  assert (select commission_paid = 5 from deals where id = d2), 'Payment survived audit failure';
  assert (select total_paid = 5 from partners where id = p.id), 'Derived total survived audit failure';
  alter table events drop constraint operations_test_event_failure;
  perform operations_partner_status(p.id,'inactive','staff');
  perform operations_partner_status(p.id,'inactive','staff');
  assert (select count(*) = 1 from events where event_type = 'partner_status_changed' and entity_id = p.id), 'Status retry duplicated event';
  update partners set status = null where id = p.id;
  perform operations_partner_status(p.id,'active','staff');
  assert (select status = 'active' from partners where id = p.id), 'Nullable text status was not updated';
  assert exists(select 1 from events where entity_id = p.id and event_type = 'partner_status_changed'
    and meta->'previous' = 'null'::jsonb and meta->>'status' = 'active'), 'Null previous status audit missing';
  begin
    perform operations_partner_status(p.id,null,'staff');
    raise exception 'Null partner status accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform operations_deal_commission(d2,200,null,false,'staff',(select updated_at from deals where id = d2));
    raise exception 'Null paid commission accepted';
  exception when invalid_parameter_value then null; end;
end $$;
rollback;
