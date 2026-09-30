-- Run on a migrated non-production database: psql "$DATABASE_URL" -f supabase/tests/verification.sql
\set ON_ERROR_STOP on
begin;
do $$
declare
  v_agent uuid;
  v_land uuid;
  v_province uuid;
  v_reviewer uuid := '11111111-1111-4111-8111-111111111111';
  v_failed boolean := false;
begin
  select id into v_province from public.provinces limit 1;
  if v_province is null then raise exception 'Test requires at least one province'; end if;
  insert into public.agents(display_name) values ('Verification test agent') returning id into v_agent;
  if exists(select 1 from public.agents where id = v_agent and verified_at is not null) then raise exception 'New agent auto-verified'; end if;
  begin
    update public.agents set verified_at = now() where id = v_agent;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Agent review pair constraint missing'; end if;
  update public.agents set verified_at = now(), verified_by = v_reviewer where id = v_agent;
  insert into public.lands(title_th, slug, province_id, land_type, size_rai, price_per_rai, status, agent_id)
  values ('Verification test property', 'verification-test-' || gen_random_uuid(), v_province, 'industrial', 10, 1000000, 'active', v_agent)
  returning id into v_land;
  if exists(select 1 from public.lands where id = v_land and verified_at is not null) then raise exception 'Publishing auto-verified property'; end if;
  update public.lands set verified_at = now(), verified_by = v_reviewer where id = v_land;
  update public.lands set status = 'draft' where id = v_land;
  if not exists(select 1 from public.lands where id = v_land and verified_at is not null) then raise exception 'Publication wrongly changes review'; end if;
  update public.lands set size_rai = 11 where id = v_land;
  if exists(select 1 from public.lands where id = v_land and (verified_at is not null or verified_by is not null)) then raise exception 'Changed facts retained review'; end if;
  update public.agents set verified_at = null, verified_by = null where id = v_agent;
  if has_table_privilege('anon', 'public.agents', 'UPDATE') or has_table_privilege('authenticated', 'public.agents', 'INSERT') then raise exception 'Public can forge agent badges'; end if;
  if has_table_privilege('anon', 'public.lands', 'UPDATE') or has_table_privilege('authenticated', 'public.lands', 'UPDATE') then raise exception 'Public can forge property badges'; end if;
  if not has_table_privilege('anon', 'public.agents', 'SELECT') then raise exception 'Public cannot read agent badges'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.agents'::regclass) then raise exception 'Agent RLS missing'; end if;
end;
$$;
rollback;
