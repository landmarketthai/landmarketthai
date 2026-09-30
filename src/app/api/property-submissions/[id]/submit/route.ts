import { NextRequest, NextResponse } from "next/server";
import { submitDraftSchema } from "@/lib/marketplace/schemas";
import { getPropertyDraft, submitPropertyDraft } from "@/lib/neon/marketplace";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitDraftSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "กรุณายอมรับนโยบายความเป็นส่วนตัว" }, { status: 400 });

  try {
    const draft = await getPropertyDraft(id, parsed.data.token);
    if (!draft) return NextResponse.json({ error: "ไม่พบแบบร่าง" }, { status: 404 });

    const missing: string[] = [];
    if (!draft.property_type) missing.push("ประเภททรัพย์");
    if (!draft.transaction_type) missing.push("ประเภทการทำรายการ");
    if (!draft.title) missing.push("ชื่อทรัพย์");
    if (!draft.province_id) missing.push("จังหวัด");
    if (draft.total_rai == null) missing.push("ขนาดพื้นที่");
    if (!draft.contact_name) missing.push("ชื่อผู้ติดต่อ");
    if (!draft.contact_phone) missing.push("เบอร์โทรศัพท์");
    if (draft.transaction_type === "sale" && draft.sale_price == null) missing.push("ราคาขาย");
    if (draft.transaction_type === "rent" && draft.rent_price_monthly == null) missing.push("ค่าเช่า");
    if (missing.length) return NextResponse.json({ error: `ข้อมูลไม่ครบ: ${missing.join(", ")}` }, { status: 400 });

    const submitted = await submitPropertyDraft({ id, token: parsed.data.token, consentPdpa: true });
    if (!submitted) return NextResponse.json({ error: "ไม่สามารถส่งแบบร่างนี้ได้" }, { status: 409 });
    return NextResponse.json({ ok: true, id: submitted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Submit property draft error:", error);
    return NextResponse.json({ error: "ส่งข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
