import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { canApplyAdminAction, publishReadinessIssues } from "@/lib/marketplace/listing-workflow";
import { getReviewSubmission, publishSubmission, reviewSubmission, setPublishedPropertyStatus } from "@/lib/neon/marketplace";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "publish", "sold", "archive", "relist"]),
  note: z.string().trim().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.action === "reject" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "กรุณาระบุเหตุผลที่ปฏิเสธ" });
  }
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const submission = await getReviewSubmission((await params).id);
  return submission ? NextResponse.json({ submission }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { id } = await params;
  const { action, note } = parsed.data;
  try {
    const submission = await getReviewSubmission(id);
    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canApplyAdminAction(submission.status, action)) {
      return NextResponse.json({ error: "สถานะปัจจุบันไม่รองรับคำสั่งนี้" }, { status: 409 });
    }
    if (action === "publish") {
      const issues = publishReadinessIssues(submission);
      if (issues.length) {
        return NextResponse.json({ error: `ยังเผยแพร่ไม่ได้: ${issues.join(", ")}`, issues }, { status: 422 });
      }
    }

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
