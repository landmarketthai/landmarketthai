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

  const now = new Date().toISOString();
  const db = createServerClient();
  const { data, error } = await db
    .from("leads")
    .select("id,name,phone,lead_type,status,assigned_to,next_action_at,last_reminded_at")
    .in("status", ["new", "contacting", "qualified"])
    .not("next_action_at", "is", null)
    .lte("next_action_at", now)
    .order("next_action_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("CRM follow-up query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const due = (data ?? []).filter((lead) => {
    if (!lead.next_action_at) return false;
    if (!lead.last_reminded_at) return true;
    return new Date(lead.last_reminded_at).getTime() < new Date(lead.next_action_at).getTime();
  });

  if (due.length === 0) return NextResponse.json({ ok: true, due_count: 0, delivered: false });

  const webhookUrl = process.env.N8N_WEBHOOK_CRM;
  if (!webhookUrl) {
    return NextResponse.json({ ok: true, due_count: due.length, delivered: false, reason: "N8N_WEBHOOK_CRM not configured" });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "crm_follow_up_digest",
        generated_at: now,
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
      console.error(`CRM follow-up webhook failed status=${response.status} body=${body}`);
      return NextResponse.json({ error: "Webhook failed", due_count: due.length }, { status: 502 });
    }

    const ids = due.map((lead) => lead.id);
    const { error: updateError } = await db.from("leads").update({ last_reminded_at: now }).in("id", ids);
    if (updateError) console.error("CRM reminder state update failed:", updateError.message);

    return NextResponse.json({ ok: true, due_count: due.length, delivered: true });
  } catch (error) {
    console.error("CRM follow-up webhook error:", error);
    return NextResponse.json({ error: "Webhook error", due_count: due.length }, { status: 502 });
  }
}
