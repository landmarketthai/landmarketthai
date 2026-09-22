import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhookUrl = process.env.N8N_WEBHOOK_CRM;
  if (!webhookUrl) {
    return NextResponse.json({ ok: true, delivered: false, reason: "N8N_WEBHOOK_CRM not configured" });
  }

  const db = createServerClient();
  const { data, error } = await db.rpc("claim_due_follow_up_leads", {
    p_limit: 200,
    p_claim_lease_seconds: 300,
  });
  if (error) {
    console.error("CRM follow-up claim failed:", error.message);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }

  const due = Array.isArray(data) ? data : data ? [data] : [];
  if (due.length === 0) return NextResponse.json({ ok: true, due_count: 0, delivered: false });

  const claimToken = due[0]?.claim_token as string | undefined;
  if (!claimToken || due.some((lead) => lead.claim_token !== claimToken)) {
    console.error("CRM follow-up claim returned inconsistent tokens");
    return NextResponse.json({ error: "Invalid claim state" }, { status: 500 });
  }

  const finishClaim = async (delivered: boolean) => {
    const { data: updated, error: finishError } = await db.rpc("finish_follow_up_claim", {
      p_claim_token: claimToken,
      p_delivered: delivered,
    });
    if (finishError) {
      console.error("CRM follow-up claim finish failed:", finishError.message);
      return false;
    }
    return Number(updated ?? 0) === due.length;
  };

  const idempotencyKey = `crm-follow-up:${createHash("sha256")
    .update(due.map((lead) => `${lead.id}:${lead.next_action_at}`).sort().join("|"))
    .digest("hex")}`;
  const generatedAt = new Date().toISOString();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "crm_follow_up_digest",
        idempotency_key: idempotencyKey,
        generated_at: generatedAt,
        due_count: due.length,
        leads: due.map((lead) => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          lead_type: lead.lead_type,
          status: lead.status,
          assigned_to: lead.assigned_to,
          next_action_at: lead.next_action_at,
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      await finishClaim(false);
      console.error(`CRM follow-up webhook failed status=${response.status} body=${body}`);
      return NextResponse.json({ error: "Webhook failed", due_count: due.length }, { status: 502 });
    }

    const stateSaved = await finishClaim(true);
    if (!stateSaved) {
      return NextResponse.json({ error: "Reminder state update failed", delivered: true, due_count: due.length }, { status: 500 });
    }

    return NextResponse.json({ ok: true, due_count: due.length, delivered: true, idempotency_key: idempotencyKey });
  } catch (error) {
    await finishClaim(false);
    console.error("CRM follow-up webhook error:", error);
    return NextResponse.json({ error: "Webhook error", due_count: due.length }, { status: 502 });
  }
}
