-- Run only against an isolated database after the Buyer Demand migration.
-- This check leaves no records behind. It is not part of migration execution.
begin;
do '
declare
  request_id uuid;
  public_id uuid;
  public_slug text;
  province_id uuid := gen_random_uuid();
  consent_column text;
  consent_timestamp text;
  withdrawn_timestamp timestamptz;
  tested_status text;
  test_lead_id uuid;
  other_lead_id uuid;
  linked_request_id uuid;
  criterion text;
  criterion_columns text[] := array[''property_type'',''province_ids'',''min_size_rai'',''max_size_rai'',
    ''max_price'',''max_price_per_rai'',''zoning'',''container_access'',''high_voltage'',
    ''preferred_locations'',''purpose'',''water_requirement'',''special_requirements''];
  criterion_values text[] := array[''''''factory'''''',null,''1'',''2'',''3'',''4'',
    ''''''purple'''''',''true'',''true'',''array[''''district'''']'',''''''purpose'''''',''''''water'''''',''''''private''''''];
  i integer;
begin
  insert into provinces (id,name_th,name_en,slug)
    values (province_id,''Regression province'',''Regression province'',''regression-'' || province_id::text);
  criterion_values[2] := format(''array[%L::uuid]'',province_id);
  insert into buyer_requirements (name,phone,consent_pdpa,consent_pdpa_at,consent_public,consent_public_at)
    values (''Regression buyer'',''0812345678'',true,now(),true,now()) returning id into request_id;
  -- Every assessed criterion invalidates both approved and published reviews.
  for i in 1..array_length(criterion_columns, 1) loop
    criterion := criterion_columns[i];
    update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=request_id;
    execute format(''update buyer_requirements set %I = %s where id = $1'', criterion, criterion_values[i]) using request_id;
    assert (select status=''pending_review'' and reviewed_at is null and reviewed_by is null
      from buyer_requirements where id=request_id), ''Approved criteria must require re-review'';
    update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=request_id;
    update buyer_requirements set status=''published'' where id=request_id;
    execute format(''update buyer_requirements set %I = %s where id = $1'', criterion,
      case when criterion=''province_ids'' then ''''''{}''''::uuid[]''
        when criterion=''preferred_locations'' then ''''''{}''''::text[]'' else ''null'' end) using request_id;
    assert (select status=''pending_review'' and reviewed_at is null and reviewed_by is null
      from buyer_requirements where id=request_id), ''Published criteria must require re-review'';
    assert not exists(select 1 from buyer_demand where buyer_requirement_id=request_id and is_public),
      ''Criteria edits must atomically hide projection'';
  end loop;
  update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=request_id;
  update buyer_requirements set status=''published'' where id=request_id;
  select id,slug into public_id,public_slug from buyer_demand where buyer_requirement_id=request_id;
  assert public_id <> request_id and public_slug = ''buyer-demand-'' || public_id::text,
    ''Public slug must not expose source ID'';
  foreach consent_column in array array[''consent_public'',''consent_pdpa''] loop
    consent_timestamp := consent_column || ''_at'';
    foreach tested_status in array array[''approved'',''published''] loop
    if tested_status = ''approved'' then
      update buyer_requirements set status=''approved'' where id=request_id;
    end if;
    execute format(''select %I from buyer_requirements where id = $1'', consent_timestamp)
      into withdrawn_timestamp using request_id;
    execute format(''update buyer_requirements set %I = false where id = $1'', consent_column) using request_id;
    assert (select status=''pending_review'' and reviewed_at is null and reviewed_by is null
      and review_note is null and published_at is null from buyer_requirements where id=request_id),
      ''Withdrawal from approved or published requires re-review'';
    assert (select case when consent_column=''consent_pdpa'' then consent_pdpa_at is null
      else consent_public_at is null end from buyer_requirements where id=request_id), ''Withdrawal clears timestamp'';
    assert not exists(select 1 from buyer_demand where buyer_requirement_id=request_id and is_public), ''Withdrawal hides atomically'';
    begin
      execute format(''update buyer_requirements set %I = true where id = $1'', consent_column) using request_id;
      raise exception ''Grant without evidence succeeded'';
    exception when raise_exception then
      if SQLERRM <> ''Fresh consent timestamp required'' then raise; end if;
    end;
    begin
      execute format(''update buyer_requirements set %I = true, %I = $2 where id = $1'', consent_column, consent_timestamp)
        using request_id, withdrawn_timestamp;
      raise exception ''Grant with stale evidence succeeded'';
    exception when raise_exception then
      if SQLERRM <> ''Fresh consent timestamp required'' then raise; end if;
    end;
    execute format(''update buyer_requirements set %I = true, %I = clock_timestamp() where id = $1'', consent_column, consent_timestamp) using request_id;
    begin
      update buyer_requirements set status=''published'' where id=request_id;
      raise exception ''Publication without re-review succeeded'';
    exception when raise_exception then
      if SQLERRM not like ''Invalid buyer request transition:%'' then raise; end if;
    end;
    update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=request_id;
    update buyer_requirements set status=''published'' where id=request_id;
    assert (select slug=public_slug from buyer_demand where buyer_requirement_id=request_id), ''Republish keeps opaque slug'';
    end loop;
  end loop;
  insert into leads (lead_type,name,phone,consent_pdpa,consent_at)
    values (''buyer'',''Linked buyer'',''0812345678'',true,now()) returning id into test_lead_id;
  insert into leads (lead_type,name,phone,consent_pdpa,consent_at)
    values (''buyer'',''Other buyer'',''0812345678'',true,now()) returning id into other_lead_id;
  insert into buyer_requirements (lead_id,name,phone,consent_pdpa,consent_pdpa_at,consent_public,consent_public_at)
    values (test_lead_id,''Linked buyer'',''0812345678'',true,now(),true,now()) returning id into linked_request_id;
  begin
    update buyer_requirements set lead_id=other_lead_id where id=linked_request_id;
    raise exception ''Lead reassignment succeeded'';
  exception when raise_exception then
    if SQLERRM <> ''Buyer request source identity cannot be changed'' then raise; end if;
  end;
  foreach tested_status in array array[''approved'',''published''] loop
    update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=linked_request_id;
    if tested_status=''published'' then update buyer_requirements set status=''published'' where id=linked_request_id; end if;
    update leads set consent_pdpa=false where id=test_lead_id;
    assert (select not consent_pdpa and not consent_public and consent_pdpa_at is null and consent_public_at is null
      and status=''pending_review'' and reviewed_at is null and reviewed_by is null
      from buyer_requirements where id=linked_request_id), ''Lead withdrawal revokes source and review'';
    assert not exists(select 1 from buyer_demand where buyer_requirement_id=linked_request_id and is_public), ''Lead withdrawal hides projection'';
    begin
      update buyer_requirements set consent_pdpa=true,consent_pdpa_at=clock_timestamp(),
        consent_public=true,consent_public_at=clock_timestamp() where id=linked_request_id;
      raise exception ''Manual re-consent bypassed withdrawn lead'';
    exception when raise_exception then
      if SQLERRM <> ''Linked lead requires current PDPA consent'' then raise; end if;
    end;
    begin
      update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=linked_request_id;
      raise exception ''Approval bypassed withdrawn lead'';
    exception when raise_exception then
      if SQLERRM <> ''Linked lead requires current PDPA consent'' then raise; end if;
    end;
    update leads set consent_pdpa=true,consent_at=clock_timestamp() where id=test_lead_id;
    update buyer_requirements set consent_pdpa=true,consent_pdpa_at=clock_timestamp(),
      consent_public=true,consent_public_at=clock_timestamp() where id=linked_request_id;
  end loop;
  update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=linked_request_id;
  update buyer_requirements set status=''published'' where id=linked_request_id;
  delete from leads where id=test_lead_id;
  assert (select lead_id is null and not consent_pdpa and not consent_public
    and consent_pdpa_at is null and consent_public_at is null and status=''pending_review''
    and reviewed_at is null and reviewed_by is null and review_note is null
    from buyer_requirements where id=linked_request_id), ''Lead deletion permits SET NULL and revokes both consents'';
  assert not exists(select 1 from buyer_demand where buyer_requirement_id=linked_request_id and is_public), ''Lead deletion hides projection'';
  -- The same FK removal must work for an approved request with stale timestamps.
  insert into leads (lead_type,name,phone,consent_pdpa,consent_at)
    values (''buyer'',''Approved buyer'',''0812345678'',true,now()) returning id into test_lead_id;
  insert into buyer_requirements (lead_id,name,phone,consent_pdpa,consent_pdpa_at)
    values (test_lead_id,''Approved buyer'',''0812345678'',true,now()) returning id into linked_request_id;
  update buyer_requirements set status=''approved'',reviewed_at=now(),reviewed_by=''test-admin'' where id=linked_request_id;
  delete from leads where id=test_lead_id;
  assert (select lead_id is null and status=''pending_review'' and not consent_pdpa and not consent_public
    and consent_pdpa_at is null and consent_public_at is null and reviewed_at is null and reviewed_by is null
    from buyer_requirements where id=linked_request_id), ''Approved lead deletion clears consent and review'';
  begin
    update buyer_demand set max_price=999 where id=public_id;
    raise exception ''Direct projection write succeeded'';
  exception when raise_exception then
    if SQLERRM <> ''Buyer demand is source-trigger-managed'' then raise; end if;
  end;
  begin
    update buyer_requirements set transaction_type=''rent'' where id=request_id;
    raise exception ''Rental buyer request succeeded'';
  exception when check_violation then null;
  end;
  for i in 1..2 loop
    begin
      update buyer_requirements set province_ids = case when i=1
        then array[gen_random_uuid(),province_id] else array[province_id,gen_random_uuid()] end where id=request_id;
      raise exception ''Unknown province accepted'';
    exception when raise_exception then
      if SQLERRM <> ''Unknown buyer province'' then raise; end if;
    end;
  end loop;
  update buyer_requirements set province_ids=array[province_id] where id=request_id;
  begin
    delete from provinces where id=province_id;
    raise exception ''Selected province lost FK protection'';
  -- RESTRICT reports 23001 on PostgreSQL 18 and 23503 on earlier versions.
  exception when restrict_violation or foreign_key_violation then null;
  end;
  delete from buyer_submission_rate_limits where client_hash=repeat(''a'',64);
  for i in 1..6 loop
    assert allow_buyer_submission(repeat(''a'',64)), ''Six requests allowed'';
  end loop;
  assert not allow_buyer_submission(repeat(''a'',64)), ''Seventh request denied'';
  update buyer_submission_rate_limits set reset_at=clock_timestamp()-interval ''1 second'' where client_hash=repeat(''a'',64);
  assert allow_buyer_submission(repeat(''a'',64)), ''Expired bucket resets'';
  assert not allow_buyer_submission(''raw-ip''), ''Raw identifiers rejected'';
end; ';
rollback;
