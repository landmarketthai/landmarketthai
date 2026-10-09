import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { isSameOriginMutation } from "@/lib/saved-searches";
import { zoningSchema } from "@/lib/zoning";
import { updateLandZoning } from "@/lib/neon/mutations";

const inputSchema = z.object({
  expected_updated_at: z.iso.datetime({ offset: true }),
  zoning_info: zoningSchema,
}).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex, nofollow" };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user) || !isSameOriginMutation(request.headers, request.nextUrl.origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const { id } = await params;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "ข้อมูลผังเมืองไม่ครบหรือไม่ถูกต้อง" }, { status: 400, headers });
  }
  try {
    const slug = await updateLandZoning(id, parsed.data.expected_updated_at, parsed.data.zoning_info);
    if (!slug) return NextResponse.json({ error: "ข้อมูลเปลี่ยนแล้วหรือไม่พบประกาศ กรุณารีโหลดก่อนบันทึก" }, { status: 409, headers });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, slug }, { headers });
  } catch (error) {
    console.error("Zoning save failed", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ ตรวจ migration และการเชื่อมต่อฐานข้อมูล" }, { status: 500, headers });
  }
}
