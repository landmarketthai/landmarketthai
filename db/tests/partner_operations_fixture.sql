-- Disposable LOCAL database fixture only; never run against an existing application database.
create type lead_type_enum as enum ('buyer','owner','partner');
create type lead_status_enum as enum ('new','contacting','qualified','won','lost');
create table leads(id uuid primary key default gen_random_uuid(), lead_type lead_type_enum not null,
  name text not null, phone text not null, line_id text, referral_code text, status lead_status_enum default 'new',
  source text, assigned_to text, consent_pdpa boolean default false, consent_at timestamptz,
  details jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table partners(id uuid primary key default gen_random_uuid(), lead_id uuid references leads(id), name text not null,
  phone text not null, line_id text, referral_code text not null unique, working_area text, experience text, network_size text,
  status text default 'pending', total_paid numeric(18,2) not null default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table lands(id uuid primary key default gen_random_uuid(), title_th text, slug text);
create table deals(id uuid primary key default gen_random_uuid(), partner_id uuid references partners(id), referral_code text,
  land_id uuid references lands(id), buyer_lead_id uuid references leads(id), deal_value numeric(18,2), closed_at timestamptz, notes text,
  commission_paid numeric(18,2), status text default 'in_progress', created_at timestamptz default now());
create table referral_attributions(id uuid primary key default gen_random_uuid(), referral_code text not null,
  lead_id uuid references leads(id), partner_id uuid references partners(id), entity_type text, first_touch_at timestamptz default now(), converted boolean default false);
create table events(id uuid primary key default gen_random_uuid(), event_type text not null, entity_type text, entity_id uuid,
  session_id text, meta jsonb default '{}', created_at timestamptz default now());
