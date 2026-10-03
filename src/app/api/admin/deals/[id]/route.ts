import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { insertEvent } from "@/lib/neon/mutations";
import { dealUpdateSchema, uuidSchema } from "@/lib/operations/schemas";
import { resolveDealState } from "@/lib/operations/rules";
import { getDeal, updateDeal } from "@/lib/operations/queries";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400, headers });
  try {
    const deal = await getDeal(id);
    return deal ? NextResponse.json({ deal }, { headers }) : NextResponse.json({ error: "Not found" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "โหลดดีลไม่สำเร็จ" }, { status: 500, headers });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const admin = await getSessionUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  const parsed = dealUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  const input = parsed.data;
  try {
    const deal = await getDeal(id);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    if (deal.updated_at !== input.expected_updated_at) {
      return NextResponse.json({ error: "ดีลนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด", code: "stale_update" }, { status: 409, headers });
    }
    const state = resolveDealState(deal, input);
    if (!state.ok) return NextResponse.json({ error: state.error, code: "invalid_transition" }, { status: 422, headers });
    // Won marks the buyer lead won; lost never touches the lead (buyer may pursue another property).
    const conversion = state.stage === "won" && deal.stage !== "won" ? "won" : deal.stage === "won" && state.stage !== "won" ? "unwon" : "none";
    const leadLog = conversion === "won"
      ? [{ at: new Date().toISOString(), by: admin.email || admin.id, type: "status" as const, from: deal.buyer_status, to: "won", deal_id: id }]
      : [];
    const result = await updateDeal(id, input, state, conversion, leadLog);
    if (!result.updated) return NextResponse.json({ error: "ดีลนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด", code: "stale_update" }, { status: 409, headers });
    const log = (error: unknown) => console.error("crm deal event failed", error);
    await insertEvent({
      eventType: "crm_deal_updated", entityType: "deal", entityId: id,
      meta: { admin_id: admin.id, from_stage: deal.stage, to_stage: state.stage, to_status: state.status,
        changes: Object.keys(input).filter((key) => key !== "expected_updated_at") },
    }).catch(log);
    if (result.wonLeadId) {
      await insertEvent({
        eventType: "crm_lead_updated", entityType: "lead", entityId: result.wonLeadId,
        meta: { admin_id: admin.id, changes: ["status"], from_status: deal.buyer_status, to_status: "won", deal_id: id },
      }).catch(log);
    }
    return NextResponse.json({ ok: true, stage: state.stage, status: state.status }, { headers });
  } catch {
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500, headers });
  }
}
