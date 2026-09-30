import { NextRequest, NextResponse } from "next/server";
import { submissionUploadSchema } from "@/lib/marketplace/schemas";
import { insertSubmissionMedia, propertyDraftExists } from "@/lib/neon/marketplace";
import { getStorageObjectMetadata, storagePublicUrl } from "@/lib/storage/provider";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = submissionUploadSchema.safeParse(body);
  const storageKey = typeof body?.storage_key === "string" ? body.storage_key : "";
  if (!parsed.success || !storageKey) return NextResponse.json({ error: "ข้อมูลไฟล์ไม่ถูกต้อง" }, { status: 400 });

  const expectedPrefix = `submissions/${id}/${parsed.data.media_kind === "image" ? "images" : "documents"}/`;
  if (!storageKey.startsWith(expectedPrefix)) return NextResponse.json({ error: "Storage key ไม่ถูกต้อง" }, { status: 400 });

  try {
    if (!(await propertyDraftExists(id, parsed.data.token))) return NextResponse.json({ error: "ไม่พบแบบร่าง" }, { status: 404 });
    const stored = await getStorageObjectMetadata(storageKey);
    if (!stored) return NextResponse.json({ error: "ยังไม่พบไฟล์ที่อัปโหลด" }, { status: 409 });
    if (stored.sizeBytes !== parsed.data.size_bytes || stored.contentType !== parsed.data.mime_type) {
      return NextResponse.json({ error: "ข้อมูลไฟล์ที่อัปโหลดไม่ตรงกับที่ยืนยัน" }, { status: 409 });
    }
    await insertSubmissionMedia({
      submissionId: id,
      mediaKind: parsed.data.media_kind,
      fileName: parsed.data.file_name,
      storageKey,
      publicUrl: parsed.data.media_kind === "image" ? storagePublicUrl(storageKey) : null,
      mimeType: parsed.data.mime_type,
      sizeBytes: parsed.data.size_bytes,
      docType: parsed.data.doc_type,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submission upload confirm error:", error);
    return NextResponse.json({ error: "บันทึกไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}
