-- Apply after marketplace_v2. Sale-only constraints are reapplied here.
-- No legacy record is implicitly public.
-- Single-quoted bodies keep PL/pgSQL intact in the release runner semicolon splitter.
begin;

-- Disable the previous definitions while normalizing legacy rows on a rerun.
drop trigger if exists revoke_lead_buyer_consent on leads;
drop trigger if exists guard_buyer_requirement_lifecycle on buyer_requirements;
drop trigger if exists sync_buyer_demand on buyer_requirements;
drop trigger if exists sanitize_buyer_demand on buyer_demand;
drop policy if exists "public read demands" on buyer_demand;

alter table buyer_requirements drop constraint if exists buyer_requirements_status_check;
alter table buyer_requirements drop constraint if exists buyer_requirements_public_consent_check;
alter table buyer_requirements drop constraint if exists buyer_requirements_pdpa_consent_check;
alter table buyer_requirements drop constraint if exists buyer_requirements_review_check;
alter table buyer_requirements drop constraint if exists buyer_requirements_publication_check;
alter table buyer_requirements drop constraint if exists buyer_requirements_numeric_check;
alter table buyer_requirements alter column status set default 'pending_review';
alter table buyer_requirements
  add column if not exists special_requirements text,
  add column if not exists consent_pdpa boolean not null default false,
  add column if not exists consent_pdpa_at timestamptz,
  add column if not exists consent_public boolean not null default false,
  add column if not exists consent_public_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists review_note text,
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz;
-- A null timestamp identifies legacy rows once, including terminal records.
-- Never restore revoked consent on a rerun.
update buyer_requirements r set consent_pdpa = l.consent_pdpa,
  consent_pdpa_at = case when l.consent_pdpa then l.consent_at end
from leads l where l.id = r.lead_id and r.submitted_at is null;
-- Missing or withdrawn lead evidence cannot be retained as requirement consent.
update buyer_requirements r set consent_pdpa = false, consent_pdpa_at = null,
  consent_public = false, consent_public_at = null,
  reviewed_at = null, reviewed_by = null, review_note = null, published_at = null,
  status = case when r.status in ('approved','published') then 'pending_review' else r.status end
where (r.consent_pdpa and r.consent_pdpa_at is null)
  or (r.consent_public and r.consent_public_at is null)
  or exists (select 1 from leads l where l.id = r.lead_id and (not l.consent_pdpa or l.consent_at is null));
update buyer_requirements set submitted_at = created_at where submitted_at is null;
alter table buyer_requirements alter column submitted_at set default now();
alter table buyer_requirements alter column submitted_at set not null;
-- Enforce sale-only even if sale_only was skipped.
alter table lands alter column transaction_type set default 'sale';
alter table lands drop constraint if exists lands_transaction_type_check;
alter table lands add constraint lands_transaction_type_check check (transaction_type = 'sale');
alter table property_submissions alter column transaction_type set default 'sale';
alter table property_submissions drop constraint if exists property_submissions_transaction_type_check;
alter table property_submissions add constraint property_submissions_transaction_type_check
  check (transaction_type is null or transaction_type = 'sale');
alter table buyer_requirements alter column transaction_type set default 'sale';
alter table buyer_requirements drop constraint if exists buyer_requirements_transaction_type_check;
alter table buyer_requirements add constraint buyer_requirements_transaction_type_check
  check (transaction_type = 'sale');
update buyer_requirements set status = 'pending_review' where status = 'active';
alter table buyer_requirements add constraint buyer_requirements_status_check
  check (status in ('pending_review','approved','published','rejected','matched','closed','expired'));
alter table buyer_requirements add constraint buyer_requirements_pdpa_consent_check
  check (not consent_pdpa or consent_pdpa_at is not null);
alter table buyer_requirements add constraint buyer_requirements_public_consent_check
  check (not consent_public or consent_public_at is not null);
alter table buyer_requirements add constraint buyer_requirements_review_check
  check (status not in ('approved','published') or
    (reviewed_at is not null and nullif(trim(reviewed_by), '') is not null));
alter table buyer_requirements add constraint buyer_requirements_publication_check
  check (status <> 'published' or (consent_pdpa and consent_pdpa_at is not null and consent_public and published_at is not null));
alter table buyer_requirements add constraint buyer_requirements_numeric_check
  check ((min_size_rai is null or min_size_rai >= 0) and (max_size_rai is null or max_size_rai >= 0)
    and (max_price is null or max_price >= 0) and (max_price_per_rai is null or max_price_per_rai >= 0));

alter table buyer_demand alter column status drop default;
alter table buyer_demand drop constraint if exists buyer_demand_status_check;
alter table buyer_demand drop constraint if exists buyer_demand_publication_check;
alter table buyer_demand drop constraint if exists buyer_demand_land_type_check;
alter table buyer_demand alter column status type text using status::text;
alter table buyer_demand alter column status set default 'unpublished';
alter table buyer_demand alter column is_public set default false;
-- V1 land_type was an enum without 'land'. Requirements use land/factory/warehouse.
alter table buyer_demand alter column land_type type text using land_type::text;
alter table buyer_demand alter column size_min_rai type numeric(14,5);
alter table buyer_demand alter column size_max_rai type numeric(14,5);
alter table buyer_demand
  add column if not exists buyer_requirement_id uuid references buyer_requirements(id) on delete restrict,
  add column if not exists province_ids uuid[] not null default '{}',
  add column if not exists max_price numeric(16,2),
  add column if not exists max_price_per_rai numeric(16,2),
  add column if not exists zoning text,
  add column if not exists container_access boolean,
  add column if not exists high_voltage boolean,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz;
create unique index if not exists buyer_demand_buyer_requirement_id_key on buyer_demand (buyer_requirement_id);
-- PostgreSQL cannot FK an array. Keep each selected province under real FK protection.
create table if not exists buyer_requirement_provinces (
  buyer_requirement_id uuid not null references buyer_requirements(id) on delete cascade,
  province_id uuid not null references provinces(id) on delete restrict,
  primary key (buyer_requirement_id, province_id)
);
alter table buyer_requirement_provinces enable row level security;
revoke all on buyer_requirement_provinces from public;
-- Legacy rows without a verifiable source stay private. valid publications survive reruns.
update buyer_demand d set is_public = false,
  status = coalesce((select case when r.status in ('matched','closed','expired')
    then r.status else 'unpublished' end from buyer_requirements r
    where r.id = d.buyer_requirement_id), 'unpublished')
where not d.is_public or not exists (
  select 1 from buyer_requirements r where r.id = d.buyer_requirement_id
    and r.status = 'published' and r.consent_pdpa and r.consent_public
    and r.consent_pdpa_at is not null and r.consent_public_at is not null and r.reviewed_at is not null
    and nullif(trim(r.reviewed_by), '') is not null and r.published_at is not null
);
alter table buyer_demand add constraint buyer_demand_status_check
  check (status in ('unpublished','published','matched','closed','expired')) not valid;
alter table buyer_demand add constraint buyer_demand_land_type_check
  check (not is_public or land_type is null or land_type in ('land','factory','warehouse')) not valid;

-- Enforce the same lifecycle for direct SQL writes. Publication needs an earlier review,
-- rather than review metadata supplied in the same write that makes a request public.
create or replace function guard_buyer_requirement_lifecycle() returns trigger language plpgsql as '
declare lead_consent boolean;
begin
  if TG_OP = ''UPDATE'' and (new.id is distinct from old.id or (new.lead_id is distinct from old.lead_id and new.lead_id is not null)) then
    raise exception ''Buyer request source identity cannot be changed'';
  end if;
  if TG_OP = ''INSERT'' then
    if new.status <> ''pending_review'' then
      raise exception ''New buyer requests must be pending_review'';
    end if;
  else
    -- Changes to assessed criteria invalidate review, even in the same write as approval.
    if row(new.property_type,new.transaction_type,new.province_ids,new.preferred_locations,
      new.min_size_rai,new.max_size_rai,new.max_price,new.max_price_per_rai,new.zoning,
      new.container_access,new.high_voltage,new.purpose,new.water_requirement,new.special_requirements)
      is distinct from row(old.property_type,old.transaction_type,old.province_ids,old.preferred_locations,
      old.min_size_rai,old.max_size_rai,old.max_price,old.max_price_per_rai,old.zoning,
      old.container_access,old.high_voltage,old.purpose,old.water_requirement,old.special_requirements) then
      new.reviewed_at := null;
      new.reviewed_by := null;
      if old.status in (''approved'',''published'') or new.status in (''approved'',''published'') then
        new.status := ''pending_review'';
      end if;
    end if;
    -- Detaching a deleted lead must revoke both consents, including on private rows.
    if old.lead_id is not null and new.lead_id is null then
      new.consent_pdpa := false;
      new.consent_public := false;
      new.consent_pdpa_at := null;
      new.consent_public_at := null;
    end if;
    if old.consent_pdpa and not new.consent_pdpa then new.consent_pdpa_at := null; end if;
    if old.consent_public and not new.consent_public then new.consent_public_at := null; end if;
    if (old.consent_pdpa and not new.consent_pdpa) or (old.consent_public and not new.consent_public)
      or (old.lead_id is not null and new.lead_id is null) then
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.review_note := null;
      new.published_at := null;
      if old.status in (''approved'',''published'') or new.status in (''approved'',''published'') then
        new.status := ''pending_review'';
      end if;
    end if;
    -- A new grant needs fresh evidence, never the timestamp from the withdrawn grant.
    if (not old.consent_pdpa and new.consent_pdpa and
        (new.consent_pdpa_at is null or new.consent_pdpa_at <= old.updated_at))
      or (not old.consent_public and new.consent_public and
        (new.consent_public_at is null or new.consent_public_at <= old.updated_at)) then
      raise exception ''Fresh consent timestamp required'';
    end if;
  end if;
  -- Lock current lead truth so concurrent withdrawal cannot race manual re-consent.
  -- App actions lock the lead first. Conflicting direct SQL may abort and must retry.
  if new.lead_id is not null then
    select consent_pdpa and consent_at is not null into lead_consent
      from leads where id = new.lead_id for share;
    if lead_consent is distinct from true and (new.consent_pdpa or new.status in (''approved'',''published'')) then
      raise exception ''Linked lead requires current PDPA consent'';
    end if;
  end if;
  if exists (select 1 from unnest(new.province_ids) requested(id)
    where not exists (select 1 from provinces p where p.id = requested.id)) then
    raise exception ''Unknown buyer province'';
  end if;
  if new.status in (''approved'',''published'') and
    (not new.consent_pdpa or new.consent_pdpa_at is null
      or (new.consent_public and new.consent_public_at is null)) then
    raise exception ''Review requires current consent evidence'';
  end if;
  if TG_OP = ''UPDATE'' and new.status is distinct from old.status then
    if not (
      (new.status = ''pending_review'' and old.status in (''approved'',''published'')) or
      (new.status = ''approved'' and old.status in (''pending_review'',''rejected'',''published'')) or
      (new.status = ''published'' and old.status = ''approved'') or
      (new.status = ''matched'' and old.status in (''approved'',''published'')) or
      (new.status = ''closed'' and old.status in (''pending_review'',''approved'',''published'',''matched'',''rejected'',''expired'')) or
      (new.status = ''rejected'' and old.status in (''pending_review'',''approved'',''published'')) or
      (new.status = ''expired'' and old.status in (''approved'',''published'',''matched''))
    ) then
      raise exception ''Invalid buyer request transition: % -> %'', old.status, new.status;
    end if;
    if new.status = ''published'' then
      if old.reviewed_at is null or nullif(trim(old.reviewed_by), '''') is null
        or new.reviewed_at is distinct from old.reviewed_at
        or new.reviewed_by is distinct from old.reviewed_by then
        raise exception ''Publication requires prior review'';
      end if;
      new.published_at := coalesce(old.published_at, now());
    end if;
  end if;
  if new.status = ''closed'' and (TG_OP = ''INSERT'' or old.status <> ''closed'') then
    new.closed_at := now();
  end if;
  if TG_OP = ''UPDATE'' then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval ''1 microsecond'');
  else
    new.updated_at := clock_timestamp();
  end if;
  return new;
end; ';
create trigger guard_buyer_requirement_lifecycle before insert or update on buyer_requirements
  for each row execute function guard_buyer_requirement_lifecycle();

-- A public projection contains only typed criteria. No user free text, contact
-- details, lead IDs, reviewer identities or internal review notes are copied.
create or replace function sanitize_buyer_demand() returns trigger language plpgsql as '
declare r buyer_requirements%rowtype;
begin
  -- Never take source locks after projection locks. Only source triggers write here.
  if pg_trigger_depth() < 2 then
    raise exception ''Buyer demand is source-trigger-managed'';
  end if;
  if TG_OP = ''DELETE'' then raise exception ''Buyer demand cannot be deleted''; end if;
  if TG_OP = ''UPDATE'' and new.buyer_requirement_id is distinct from old.buyer_requirement_id then
    raise exception ''Buyer demand source cannot be changed'';
  end if;
  if new.is_public then
    select * into r from buyer_requirements where id = new.buyer_requirement_id;
    if not found or r.status <> ''published'' or not r.consent_public or not r.consent_pdpa
      or r.consent_pdpa_at is null or r.consent_public_at is null or r.reviewed_at is null
      or nullif(trim(r.reviewed_by), '''') is null or r.published_at is null then
      raise exception ''Buyer demand requires reviewed source and public consent'';
    end if;
    new.slug := ''buyer-demand-'' || new.id::text;
    new.province_id := r.province_ids[1];
    new.province_ids := r.province_ids;
    new.land_type := r.property_type;
    new.size_min_rai := r.min_size_rai;
    new.size_max_rai := r.max_size_rai;
    new.max_price := r.max_price;
    new.max_price_per_rai := r.max_price_per_rai;
    -- zoning is stored as text on the private source; never expose arbitrary text.
    new.zoning := case when r.zoning in (''purple'',''purple_light'',''brown'',''orange'',''yellow'',''green'',''other'') then r.zoning end;
    new.container_access := r.container_access;
    new.high_voltage := r.high_voltage;
    new.intended_use := null;
    new.budget_note := null;
    new.seo_title := null;
    new.seo_description := null;
    new.status := ''published'';
    new.reviewed_at := r.reviewed_at;
    -- Compatibility marker for public readers, never an admin ID or name.
    new.reviewed_by := ''reviewed'';
    new.published_at := r.published_at;
    new.closed_at := null;
  end if;
  new.updated_at := now();
  return new;
end; ';
create trigger sanitize_buyer_demand before insert or update or delete on buyer_demand
  for each row execute function sanitize_buyer_demand();

create or replace function sync_buyer_demand() returns trigger language plpgsql as '
begin
  delete from buyer_requirement_provinces where buyer_requirement_id = new.id
    and not (province_id = any(new.province_ids));
  insert into buyer_requirement_provinces (buyer_requirement_id,province_id)
    select new.id,province_id from unnest(new.province_ids) as selected(province_id)
    on conflict do nothing;
  if new.status = ''published'' and new.consent_public and new.consent_pdpa then
    insert into buyer_demand (buyer_requirement_id,slug,status,is_public)
    values (new.id,''buyer-demand-'' || gen_random_uuid()::text,''published'',true)
    on conflict (buyer_requirement_id) do update set is_public = true;
  else
    update buyer_demand set is_public = false,
      status = case when new.status in (''matched'',''closed'',''expired'') then new.status else ''unpublished'' end,
      closed_at = new.closed_at
    where buyer_requirement_id = new.id;
  end if;
  return new;
end; ';
create trigger sync_buyer_demand after insert or update on buyer_requirements
  for each row execute function sync_buyer_demand();

-- The lead row is already locked. Take requirement locks in stable order before
-- their source triggers acquire projection locks: leads -> buyer_requirements -> buyer_demand.
create or replace function revoke_lead_buyer_consent() returns trigger language plpgsql as '
begin
  if not new.consent_pdpa or new.consent_at is null then
    perform id from buyer_requirements where lead_id = new.id order by id for update;
    update buyer_requirements set consent_pdpa = false, consent_public = false where lead_id = new.id;
  end if;
  return new;
end; ';
create trigger revoke_lead_buyer_consent after update of consent_pdpa, consent_at on leads
  for each row execute function revoke_lead_buyer_consent();

-- Do not validate the reviewer marker until the sanitizer has normalized older projections.
alter table buyer_demand add constraint buyer_demand_publication_check
  check (not is_public or (status = 'published' and buyer_requirement_id is not null
    and reviewed_at is not null and reviewed_by is not null
    and reviewed_by = 'reviewed' and published_at is not null)) not valid;
-- Rebuild public projections through their source, including opaque slugs.
update buyer_requirements set status = status where status = 'published';
update buyer_requirements set status = status where status <> 'published';
alter table buyer_demand validate constraint buyer_demand_status_check;
alter table buyer_demand validate constraint buyer_demand_land_type_check;
alter table buyer_demand validate constraint buyer_demand_publication_check;

alter table buyer_requirements enable row level security;
alter table buyer_demand enable row level security;
create policy "public read demands" on buyer_demand for select
  using (is_public and status = 'published' and buyer_requirement_id is not null
    and published_at is not null and reviewed_at is not null and reviewed_by = 'reviewed');
-- Private ephemeral HMAC identifiers only. Capacity is atomic across app instances.
create table if not exists buyer_submission_rate_limits (
  client_hash text primary key check (client_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null check (request_count between 1 and 6),
  reset_at timestamptz not null
);
create index if not exists idx_buyer_submission_rate_limits_expiry on buyer_submission_rate_limits (reset_at);
alter table buyer_submission_rate_limits enable row level security;
create or replace function allow_buyer_submission(client_digest text) returns boolean language plpgsql as '
declare current_count integer;
begin
  if client_digest is null or client_digest !~ ''^[0-9a-f]{64}$'' then return false; end if;
  -- ponytail: serialize this short helper at 10,000 live keys, shard if throughput requires it.
  perform pg_advisory_xact_lock(20261001, 7);
  delete from buyer_submission_rate_limits where reset_at <= clock_timestamp();
  select request_count into current_count from buyer_submission_rate_limits where client_hash = client_digest;
  if found then
    if current_count >= 6 then return false; end if;
    update buyer_submission_rate_limits set request_count = request_count + 1 where client_hash = client_digest;
  else
    if (select count(*) from buyer_submission_rate_limits) >= 10000 then return false; end if;
    insert into buyer_submission_rate_limits values (client_digest, 1, clock_timestamp() + interval ''1 minute'');
  end if;
  return true;
end; ';
revoke all on buyer_submission_rate_limits from public;
revoke all on function allow_buyer_submission(text) from public;

-- Neon uses server-side access. Never grant private tables to Data API roles.
do ' declare role_name text; begin
  foreach role_name in array array[''anonymous'',''authenticated'',''anon''] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(''revoke all on buyer_requirements from %I'', role_name);
      execute format(''revoke all on buyer_requirement_provinces from %I'', role_name);
      execute format(''revoke all on buyer_submission_rate_limits from %I'', role_name);
      execute format(''revoke all on function allow_buyer_submission(text) from %I'', role_name);
      execute format(''revoke all on buyer_demand from %I'', role_name);
    end if;
  end loop;
end; ';
create index if not exists idx_buyer_demand_public_review on buyer_demand (published_at desc)
  where is_public and status = 'published';
commit;
