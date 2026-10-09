import { NextRequest, NextResponse } from "next/server";
import { draftSchema } from "@/lib/marketplace/schemas";
import { getPropertyDraft, savePropertyDraft } from "@/lib/neon/marketplace";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.headers.get("x-draft-token");
  if (!token) return NextResponse.json({ error: "Draft token required" }, { status: 401 });
  try {
    const draft = await getPropertyDraft(id, token);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get property draft error:", error);
    return NextResponse.json({ error: "Unable to load draft" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft", issues: parsed.error.flatten() }, { status: 400 });

  const { token, ...input } = parsed.data;
  try {
    const draft = await savePropertyDraft(id, token, input);
    if (!draft) return NextResponse.json({ error: "Draft not found or already submitted" }, { status: 404 });
    return NextResponse.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Trigger sync_land_zoning_info raises SQLSTATE LZ409 when a legacy-only zoning write would erase structured zoning_info.
    const e = error as { code?: string; cause?: { code?: string } };
    if (e?.code === "LZ409" || e?.cause?.code === "LZ409") {
      return NextResponse.json({ error: "ข้อมูลผังเมืองมีการแก้ไขจากหน้าจออื่น กรุณารีโหลดหน้าแล้วแก้ไขอีกครั้ง" }, { status: 409 });
    }
    console.error("Save property draft error:", error);
    return NextResponse.json({ error: "Unable to save draft" }, { status: 500 });
  }
}
