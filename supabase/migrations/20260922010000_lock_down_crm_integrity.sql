-- Close public-write bypasses and make Owner Lead -> Draft Property atomic.
-- Public forms use server routes/actions with the service role, so direct anon writes
-- are unnecessary and would bypass application validation/referral safeguards.

drop policy if exists "anon insert leads" on leads;
drop policy if exists "anon insert lead_attachments" on lead_attachments;
drop policy if exists "anon insert events" on events;

revoke insert on table leads, lead_attachments, events from anon, authenticated;

create or replace function create_property_draft_from_owner_lead(
  p_lead_id uuid,
  p_province_id uuid,
  p_title text,
  p_slug text,
  p_district text,
  p_land_type land_type_enum,
  p_size_rai numeric,
  p_zoning zoning_enum,
  p_price_per_rai numeric,
  p_referral_reward_max numeric,
  p_is_eec boolean,
  p_created_by text
)
returns table(land_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_type lead_type_enum;
  v_existing_id uuid;
  v_land_id uuid;
begin
  if p_lead_id is null then raise exception 'owner lead is required'; end if;
  if p_province_id is null then raise exception 'province is required'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(p_slug), '') is null then raise exception 'slug is required'; end if;
  if p_size_rai is null or p_size_rai <= 0 then raise exception 'size must be positive'; end if;
  if p_price_per_rai is null or p_price_per_rai <= 0 then raise exception 'price per rai must be positive'; end if;

  -- Lock the owner lead so two admin clicks cannot create two drafts concurrently.
  select l.lead_type into v_lead_type
  from leads l
  where l.id = p_lead_id
  for update;

  if not found then raise exception 'owner lead not found'; end if;
  if v_lead_type <> 'owner' then raise exception 'only owner leads can create property drafts'; end if;

  select l.id into v_existing_id
  from lands l
  where l.owner_lead_id = p_lead_id
  order by l.created_at asc
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, false;
    return;
  end if;

  insert into lands(
    title_th, slug, province_id, district, land_type, size_rai, zoning,
    frontage_m, price_per_rai, referral_reward_max, is_eec,
    nearby_landmarks, description, lat, lng, location_precision,
    status, is_featured, seo_title, seo_description, owner_lead_id
  ) values (
    btrim(p_title), lower(btrim(p_slug)), p_province_id, nullif(btrim(p_district), ''),
    p_land_type, p_size_rai, p_zoning, null, p_price_per_rai,
    p_referral_reward_max, coalesce(p_is_eec, false), null, null, null, null,
    'approx', 'draft', false, null, null, p_lead_id
  )
  returning id into v_land_id;

  update leads
  set status = 'qualified', updated_at = now()
  where id = p_lead_id;

  insert into lead_activities(lead_id, activity_type, note, created_by)
  values (
    p_lead_id,
    'note',
    'สร้าง Draft Property: ' || btrim(p_title),
    nullif(btrim(p_created_by), '')
  );

  return query select v_land_id, true;
end;
$$;

revoke all on function create_property_draft_from_owner_lead(uuid, uuid, text, text, text, land_type_enum, numeric, zoning_enum, numeric, numeric, boolean, text)
  from public, anon, authenticated;
grant execute on function create_property_draft_from_owner_lead(uuid, uuid, text, text, text, land_type_enum, numeric, zoning_enum, numeric, numeric, boolean, text)
  to service_role;
