-- Disposable LOCAL database fixture only; never run against an existing application database.
create type lead_type_enum as enum ('buyer','owner','partner');
create type lead_status_enum as enum ('new','contacting','qualified','won','lost');
create type partner_status_enum as enum ('pending','active','inactive');
create type deal_status_enum as enum ('in_progress','closed','cancelled');
create table leads(id uuid primary key default gen_random_uuid(), lead_type lead_type_enum not null,
  name text not null, phone text not null, line_id text, referral_code text, status lead_status_enum default 'new',
  details jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table partners(id uuid primary key default gen_random_uuid(), lead_id uuid references leads(id), name text not null,
  phone text not null, line_id text, referral_code text not null unique, working_area text, experience text, network_size text,
  status partner_status_enum default 'pending', total_paid numeric(18,2) not null default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table deals(id uuid primary key default gen_random_uuid(), partner_id uuid references partners(id), referral_code text,
  commission_paid numeric(18,2), status deal_status_enum default 'in_progress', created_at timestamptz default now());
create table referral_attributions(id uuid primary key default gen_random_uuid(), referral_code text not null,
  lead_id uuid references leads(id), partner_id uuid references partners(id), entity_type text, first_touch_at timestamptz default now(), converted boolean default false);
create table events(id uuid primary key default gen_random_uuid(), event_type text not null, entity_type text, entity_id uuid,
  session_id text, meta jsonb default '{}', created_at timestamptz default now());
