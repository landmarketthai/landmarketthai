import { getSql } from "@/lib/neon/server";
import { lineConfig, pushLine, requestFingerprint, retryDelay } from "@/lib/line/delivery";

export const CLAIM_NOTIFICATION = `update public.line_notification_outbox o
  set status='processing', attempts=o.attempts+1, lease_token=gen_random_uuid(),
      lease_until=now()+interval '2 minutes', first_attempt_at=coalesce(o.first_attempt_at,now()), updated_at=now()
  from (select id from public.line_notification_outbox
    where ((status in ('pending','retry') and available_at <= now()) or (status='processing' and lease_until < now()))
      and attempts < 8 and (first_attempt_at is null or first_attempt_at > now()-interval '23 hours')
      and created_at > now()-interval '7 days'
    order by available_at, created_at for update skip locked limit 1) candidate
  where o.id=candidate.id returning o.*`;

export async function notificationStats() {
  const rows = await getSql().query(`select count(*) filter (where status='pending')::int as pending,
    count(*) filter (where status='retry')::int as retry, count(*) filter (where status='failed')::int as failed,
    count(*) filter (where status='processing' and lease_until < now())::int as stuck,
    min(created_at) filter (where status in ('pending','retry','processing')) as oldest_pending
    from public.line_notification_outbox`, []);
  return rows[0];
}

export async function dispatchNotifications() {
  const config = lineConfig();
  if (!config) return { enabled: false, processed: 0 };
  const sql = getSql();
  // Expire ambiguous sends before LINE's 24-hour deduplication window can lapse.
  await sql.query(`update public.line_notification_outbox set status='failed',
    last_error=case when attempts >= 8 then 'attempt_limit' else 'delivery_window_expired' end,
    lease_token=null,lease_until=null,updated_at=now()
    where status in ('pending','retry','processing') and (lease_until is null or lease_until < now())
      and (attempts >= 8 or first_attempt_at <= now()-interval '23 hours' or created_at <= now()-interval '7 days')`, []);
  await sql.query(`delete from public.line_notification_outbox where id in (
    select id from public.line_notification_outbox where (status='sent' and updated_at < now()-interval '30 days')
      or (status='failed' and updated_at < now()-interval '90 days') order by updated_at limit 1000)`, []);
  let processed = 0;
  const deadline = Date.now() + 20_000;
  while (processed < 3 && Date.now() < deadline) {
    const [job] = await sql.query(CLAIM_NOTIFICATION, []);
    if (!job) break;
    processed++;
    const id = String(job.id), lease = String(job.lease_token);
    let fingerprint;
    try {
      fingerprint = requestFingerprint(String(job.event_type), config);
    } catch { /* A malformed persisted event must never reach LINE. */ }
    let result;
    if (!fingerprint || (job.request_fingerprint && job.request_fingerprint !== fingerprint)) {
      result = { status: "failed" as const, error: fingerprint ? "request_configuration_changed" : "invalid_event" };
    } else {
      const bound = await sql.query(`update public.line_notification_outbox set request_fingerprint=$3
        where id=$1 and lease_token=$2 and status='processing' and lease_until > now() returning id`, [id, lease, fingerprint]);
      if (!bound.length) continue;
      result = await pushLine(String(job.event_type), String(job.retry_key), config);
    }
    const status = result.status === "retry" && Number(job.attempts) >= 8 ? "failed" : result.status;
    await sql.query(`update public.line_notification_outbox set status=$3,last_error=$4,last_http_status=$5,
      line_request_id=coalesce($6,line_request_id), available_at=now()+($7 * interval '1 second'),
      lease_token=null,lease_until=null,updated_at=now(),sent_at=case when $3='sent' then now() else null end
      where id=$1 and lease_token=$2 and status='processing'`,
    [id, lease, status, result.error ?? null, result.httpStatus ?? null, result.requestId ?? null,
      retryDelay(Number(job.attempts), result.retryAfterSeconds)]);
    if (status === "failed") console.error("[line-notifications] terminal_failure", { id, code: result.error });
    if (result.httpStatus === 429) break;
  }
  return { enabled: true, processed };
}
