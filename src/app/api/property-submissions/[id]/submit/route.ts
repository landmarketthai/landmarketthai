import { NextRequest, NextResponse } from "next/server";
import { submitDraftSchema } from "@/lib/marketplace/schemas";
import { submissionReadinessIssues } from "@/lib/marketplace/submission-readiness";
import { getPropertyDraft, submitPropertyDraft } from "@/lib/neon/marketplace";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitDraftSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "กรุณายอมรับนโยบายความเป็นส่วนตัว" }, { status: 400 });

  try {
    const draft = await getPropertyDraft(id, parsed.data.token);
    if (!draft) return NextResponse.json({ error: "ไม่พบแบบร่าง" }, { status: 404 });

    const missing = submissionReadinessIssues(draft);
    if (missing.length) return NextResponse.json({ error: `ข้อมูลไม่ครบหรือไม่ถูกต้อง: ${missing.join(", ")}` }, { status: 400 });

    const submitted = await submitPropertyDraft({ id, token: parsed.data.token, consentPdpa: true });
    if (!submitted) return NextResponse.json({ error: "ไม่สามารถส่งแบบร่างนี้ได้" }, { status: 409 });
    return NextResponse.json({ ok: true, id: submitted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Submit property draft error:", error);
    return NextResponse.json({ error: "ส่งข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
