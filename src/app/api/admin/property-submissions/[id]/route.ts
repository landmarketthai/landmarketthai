import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin";
import { getReviewSubmission, publishSubmission, reviewSubmission, setPublishedPropertyStatus } from "@/lib/neon/marketplace";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "publish", "sold", "expired"]),
  note: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.action === "reject" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "กรุณาระบุเหตุผลที่ปฏิเสธ" });
  }
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminUser(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const submission = await getReviewSubmission((await params).id);
  return submission ? NextResponse.json({ submission }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminUser(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { id } = await params;
  const { action, note } = parsed.data;
  try {
    const result = action === "approve" || action === "reject"
      ? await reviewSubmission(id, action, note)
      : action === "publish"
        ? Boolean(await publishSubmission(id))
        : await setPublishedPropertyStatus(id, action);
    return result
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "สถานะปัจจุบันไม่รองรับคำสั่งนี้" }, { status: 409 });
  } catch (error) {
    console.error("Admin property review error:", error);
    return NextResponse.json({ error: "ดำเนินการไม่สำเร็จ" }, { status: 500 });
  }
}
