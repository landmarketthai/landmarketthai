import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { insertEvent } from "@/lib/neon/mutations";
import { leadUpdateSchema, uuidSchema } from "@/lib/operations/schemas";
import { canTransitionLead } from "@/lib/operations/rules";
import { getLead, updateLead, type CrmLogEntry } from "@/lib/operations/queries";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400, headers });
  try {
    const lead = await getLead(id);
    return lead ? NextResponse.json({ lead }, { headers }) : NextResponse.json({ error: "Not found" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "โหลดลีดไม่สำเร็จ" }, { status: 500, headers });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const admin = await getSessionUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers });
  const input = parsed.data;
  try {
    const lead = await getLead(id);
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    if (lead.updated_at !== input.expected_updated_at) {
      return NextResponse.json({ error: "ลีดนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด", code: "stale_update" }, { status: 409, headers });
    }
    const ended = lead.status === "won" || lead.status === "lost";
    if (input.reopen && !(ended && input.status === "contacting")) {
      return NextResponse.json({ error: "เปิดลีดใหม่ได้เฉพาะลีดที่ปิดแล้ว และต้องเปลี่ยนเป็นกำลังติดต่อ" }, { status: 422, headers });
    }
    if (input.status && !canTransitionLead(lead.status, input.status, input.reopen)) {
      return NextResponse.json({ error: "เปลี่ยนสถานะนี้ไม่ได้", code: "invalid_transition" }, { status: 422, headers });
    }
    const at = new Date().toISOString();
    const by = admin.email || admin.id;
    const log: CrmLogEntry[] = [];
    if (input.status && input.status !== lead.status) log.push({ at, by, type: "status", from: lead.status, to: input.status });
    if (input.assigned_to !== undefined && input.assigned_to !== lead.assigned_to) log.push({ at, by, type: "assign", from: lead.assigned_to, to: input.assigned_to });
    if (input.next_action_at !== undefined) log.push({ at, by, type: "next_action", from: lead.next_action_at, to: input.next_action_at });
    if (input.note) log.push({ at, by, type: "note", text: input.note });
    if (!(await updateLead(id, input, log))) {
      return NextResponse.json({ error: "ลีดนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด", code: "stale_update" }, { status: 409, headers });
    }
    // Event meta stays free of contact data and note text.
    await insertEvent({
      eventType: "crm_lead_updated", entityType: "lead", entityId: id,
      meta: { admin_id: admin.id, changes: log.map((entry) => entry.type), from_status: lead.status, to_status: input.status ?? lead.status },
    }).catch((error) => console.error("crm_lead_updated event failed", error));
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500, headers });
  }
}
