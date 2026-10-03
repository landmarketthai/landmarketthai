import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { insertEvent } from "@/lib/neon/mutations";
import { dealCreateSchema, dealFiltersSchema, firstParams } from "@/lib/operations/schemas";
import { createDeal, listDeals } from "@/lib/operations/queries";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const filters = dealFiltersSchema.safeParse(firstParams(request.nextUrl.searchParams));
  if (!filters.success) return NextResponse.json({ error: "ตัวกรองไม่ถูกต้อง" }, { status: 400, headers });
  try {
    return NextResponse.json({ deals: await listDeals(filters.data) }, { headers });
  } catch {
    return NextResponse.json({ error: "โหลดดีลไม่สำเร็จ" }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getSessionUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const parsed = dealCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลดีลไม่ถูกต้อง ต้องมีลีดผู้ซื้อและทรัพย์" }, { status: 400, headers });
  try {
    const result = await createDeal(parsed.data);
    if (result.kind === "lead_not_found") return NextResponse.json({ error: "ไม่พบลีดผู้ซื้อ" }, { status: 404, headers });
    if (result.kind === "duplicate") return NextResponse.json({ error: "มีดีลของผู้ซื้อกับทรัพย์นี้แล้ว", code: "duplicate_deal", id: result.id }, { status: 409, headers });
    await insertEvent({
      eventType: "crm_deal_created", entityType: "deal", entityId: result.id,
      meta: { admin_id: admin.id, buyer_lead_id: parsed.data.buyer_lead_id, land_id: parsed.data.land_id ?? null, attribution_id: result.attributionId },
    }).catch((error) => console.error("crm_deal_created event failed", error));
    return NextResponse.json({ id: result.id }, { status: 201, headers });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "23505") return NextResponse.json({ error: "มีดีลของผู้ซื้อกับทรัพย์นี้แล้ว", code: "duplicate_deal" }, { status: 409, headers });
    if (code === "23503") return NextResponse.json({ error: "ไม่พบทรัพย์ (land_id)" }, { status: 422, headers });
    return NextResponse.json({ error: "สร้างดีลไม่สำเร็จ" }, { status: 500, headers });
  }
}
