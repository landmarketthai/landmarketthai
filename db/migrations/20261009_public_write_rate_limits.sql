begin;

-- Private ephemeral HMAC identifiers only. Per-client rows plus one '*' global row per bucket.
create table if not exists public_write_rate_limits (
  bucket text not null check (bucket ~ '^[a-z_]{1,40}$'),
  client_hash text not null check (client_hash ~ '^([0-9a-f]{64}|\*)$'),
  request_count integer not null check (request_count >= 1),
  reset_at timestamptz not null,
  primary key (bucket, client_hash)
);
create index if not exists idx_public_write_rate_limits_reset on public_write_rate_limits (reset_at);
alter table public_write_rate_limits enable row level security;

-- Returns 0 when allowed, else seconds until the exceeded bucket resets. Atomic upserts, no global lock or key cap.
create or replace function consume_rate_limit(p_bucket text, p_client text, p_limit int, p_global_limit int, p_window_seconds int)
returns integer language plpgsql set search_path = public as '
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_reset timestamptz;
begin
  if p_bucket is null or p_bucket !~ ''^[a-z_]{1,40}$'' or p_client is null or p_client !~ ''^[0-9a-f]{64}$''
    or p_limit is null or p_limit < 1 or p_global_limit is null or p_global_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return greatest(coalesce(p_window_seconds, 60), 1);
  end if;

  -- Client first, so a client already over its limit does not burn global quota.
  insert into public_write_rate_limits as t (bucket, client_hash, request_count, reset_at)
  values (p_bucket, p_client, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket, client_hash) do update set
    request_count = case when t.reset_at <= v_now then 1 else least(t.request_count + 1, p_limit + 1) end,
    reset_at = case when t.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds) else t.reset_at end
  returning request_count, reset_at into v_count, v_reset;
  if v_count > p_limit then
    return greatest(ceil(extract(epoch from v_reset - v_now))::integer, 1);
  end if;

  insert into public_write_rate_limits as t (bucket, client_hash, request_count, reset_at)
  values (p_bucket, ''*'', 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket, client_hash) do update set
    request_count = case when t.reset_at <= v_now then 1 else least(t.request_count + 1, p_global_limit + 1) end,
    reset_at = case when t.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds) else t.reset_at end
  returning request_count, reset_at into v_count, v_reset;

  -- Bounded opportunistic cleanup of long-expired rows.
  if random() < 0.02 then
    delete from public_write_rate_limits where ctid in (
      select ctid from public_write_rate_limits where reset_at < clock_timestamp() - interval ''1 hour'' limit 100);
  end if;

  if v_count > p_global_limit then
    return greatest(ceil(extract(epoch from v_reset - v_now))::integer, 1);
  end if;
  return 0;
end; ';

revoke all on public_write_rate_limits from public;
revoke all on function consume_rate_limit(text, text, int, int, int) from public;

-- Neon uses server-side access. Never grant private tables to Data API roles.
do ' declare role_name text; begin
  foreach role_name in array array[''anonymous'',''authenticated'',''anon''] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(''revoke all on public_write_rate_limits from %I'', role_name);
      execute format(''revoke all on function consume_rate_limit(text, text, int, int, int) from %I'', role_name);
    end if;
  end loop;
end; ';

commit;
