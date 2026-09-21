import { NextRequest, NextResponse } from "next/server";
import { sendCrmEvent } from "@/lib/crm-webhook";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerClient();
  const runDate = bangkokDate();
  const jobKey = "crm_daily_summary";

  const { data: existing, error: existingError } = await db
    .from("crm_automation_runs")
    .select("id,status")
    .eq("job_key", jobKey)
    .eq("run_date", runDate)
    .maybeSingle();
  if (existingError && existingError.code !== "PGRST116") {
    return NextResponse.json({ error: "Automation ledger query failed" }, { status: 500 });
  }
  if (existing?.status === "sent") {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_sent", run_date: runDate });
  }

  let runId = existing?.id as string | undefined;
  if (!runId) {
    const { data: created, error: createError } = await db
      .from("crm_automation_runs")
      .insert({ job_key: jobKey, run_date: runDate, status: "pending", updated_at: new Date().toISOString() })
      .select("id")
      .single();
    if (createError) {
      if (createError.code === "23505") {
        return NextResponse.json({ ok: true, skipped: true, reason: "concurrent_run", run_date: runDate });
      }
      return NextResponse.json({ error: "Automation ledger create failed" }, { status: 500 });
    }
    runId = created.id;
  }

  const [newLeads, qualifiedLeads, activeDeals, wonDeals, payableCommissions, pendingCommissions] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("status", "qualified"),
    db.from("deals").select("id", { count: "exact", head: true }).not("stage", "in", "(won,lost)"),
    db.from("deals").select("id", { count: "exact", head: true }).eq("stage", "won"),
    db.from("commissions").select("id", { count: "exact", head: true }).eq("status", "payable"),
    db.from("commissions").select("id", { count: "exact", head: true }).in("status", ["estimated", "approved"]),
  ]);

  const results = [newLeads, qualifiedLeads, activeDeals, wonDeals, payableCommissions, pendingCommissions];
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    await db.from("crm_automation_runs").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", runId);
    return NextResponse.json({ error: "Summary query failed" }, { status: 500 });
  }

  const summary = {
    run_date: runDate,
    new_leads: newLeads.count ?? 0,
    qualified_leads: qualifiedLeads.count ?? 0,
    active_deals: activeDeals.count ?? 0,
    won_deals: wonDeals.count ?? 0,
    payable_commissions: payableCommissions.count ?? 0,
    commissions_needing_review: pendingCommissions.count ?? 0,
  };

  const delivered = await sendCrmEvent("crm_daily_summary", summary);
  const now = new Date().toISOString();
  await db
    .from("crm_automation_runs")
    .update({ status: delivered ? "sent" : "failed", sent_at: delivered ? now : null, updated_at: now })
    .eq("id", runId);

  if (!delivered) {
    return NextResponse.json({ ok: false, delivered: false, ...summary }, { status: 502 });
  }
  return NextResponse.json({ ok: true, delivered: true, ...summary });
}
