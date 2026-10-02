import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { applyBuyerAdminAction, getBuyerRequirement } from "@/lib/neon/marketplace";
import { canApplyBuyerAction } from "@/lib/marketplace/buyer-demand-workflow";
import { buyerApprovalReadinessIssues, buyerPublishReadinessIssues } from "@/app/admin/buyer-requirements/review-readiness";

const idSchema = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(["approve", "publish", "unpublish", "matched", "closed", "reject"]),
  expected_updated_at: z.string().datetime(),
  note: z.string().trim().max(2000).optional(),
}).strict().refine((value) => value.action !== "reject" || Boolean(value.note), { path: ["note"], message: "ระบุเหตุผลที่ปฏิเสธ" });
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400, headers });
  try {
    const requirement = await getBuyerRequirement(id);
    return requirement ? NextResponse.json({ requirement }, { headers }) : NextResponse.json({ error: "Not found" }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "โหลดความต้องการซื้อไม่สำเร็จ" }, { status: 500, headers });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const admin = await getSessionUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "คำสั่งหรือเหตุผลไม่ถูกต้อง" }, { status: 400, headers });
  try {
    const requirement = await getBuyerRequirement(id);
    if (!requirement) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    if (requirement.updated_at !== parsed.data.expected_updated_at) {
      return NextResponse.json({ error: "รายการนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดและตรวจสอบอีกครั้ง", code: "stale_update" }, { status: 409, headers });
    }
    if (!canApplyBuyerAction(requirement.status, parsed.data.action)) {
      return NextResponse.json({ error: "สถานะปัจจุบันไม่รองรับคำสั่งนี้ กรุณาโหลดรายการใหม่" }, { status: 409, headers });
    }
    if (parsed.data.action === "approve" || parsed.data.action === "publish") {
      const issues = parsed.data.action === "approve" ? buyerApprovalReadinessIssues(requirement) : buyerPublishReadinessIssues(requirement);
      if (issues.length) return NextResponse.json({ error: `${parsed.data.action === "approve" ? "ยังอนุมัติไม่ได้" : "ยังเผยแพร่ไม่ได้"}: ${issues.join(", ")}`, issues }, { status: 422, headers });
    }
    const ok = await applyBuyerAdminAction(id, parsed.data.action, admin.id, parsed.data.expected_updated_at, parsed.data.note);
    if (!ok) return NextResponse.json({ error: "รายการนี้เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดและตรวจสอบอีกครั้ง", code: "stale_update" }, { status: 409, headers });
    revalidatePath("/");
    revalidatePath("/buyer-demand");
    revalidatePath("/buyer-demand/[slug]", "page");
    revalidatePath("/sitemap.xml");
    revalidatePath("/admin/buyer-requirements");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "ดำเนินการไม่สำเร็จ" }, { status: 500, headers });
  }
}
