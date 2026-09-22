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

  const { data: claimRows, error: claimError } = await db.rpc("claim_crm_automation_run", {
    p_job_key: jobKey,
    p_run_date: runDate,
  });
  if (claimError) {
    console.error("CRM daily summary claim failed:", claimError.message);
    return NextResponse.json({ error: "Automation claim failed" }, { status: 500 });
  }

  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  const runId = claim?.run_id as string | undefined;
  const claimToken = claim?.run_claim_token as string | undefined;
  if (!runId || !claimToken) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_claimed_or_sent", run_date: runDate });
  }

  const finishRun = async (success: boolean) => {
    const { data, error } = await db.rpc("finish_crm_automation_run", {
      p_run_id: runId,
      p_claim_token: claimToken,
      p_success: success,
    });
    if (error) {
      console.error("CRM daily summary finish failed:", error.message);
      return false;
    }
    return data === true;
  };

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
    await finishRun(false);
    return NextResponse.json({ error: "Summary query failed" }, { status: 500 });
  }

  const summary = {
    idempotency_key: `${jobKey}:${runDate}`,
    run_date: runDate,
    new_leads: newLeads.count ?? 0,
    qualified_leads: qualifiedLeads.count ?? 0,
    active_deals: activeDeals.count ?? 0,
    won_deals: wonDeals.count ?? 0,
    payable_commissions: payableCommissions.count ?? 0,
    commissions_needing_review: pendingCommissions.count ?? 0,
  };

  const delivered = await sendCrmEvent("crm_daily_summary", summary);
  const stateSaved = await finishRun(delivered);
  if (!stateSaved) {
    return NextResponse.json({ error: "Automation state update failed", delivered, ...summary }, { status: 500 });
  }

  if (!delivered) {
    return NextResponse.json({ ok: false, delivered: false, ...summary }, { status: 502 });
  }
  return NextResponse.json({ ok: true, delivered: true, ...summary });
}
