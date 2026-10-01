import { NextRequest, NextResponse } from "next/server";
import { submissionUploadSchema } from "@/lib/marketplace/schemas";
import { propertyDraftExists } from "@/lib/neon/marketplace";
import { generatePresignedUpload } from "@/lib/storage/provider";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submissionUploadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ไฟล์ไม่ถูกต้อง" }, { status: 400 });

  try {
    if (!(await propertyDraftExists(id, parsed.data.token))) {
      return NextResponse.json({ error: "ไม่พบแบบร่าง" }, { status: 404 });
    }
    const folder = parsed.data.media_kind === "image" ? `submissions/${id}/images` as const : `submissions/${id}/documents` as const;
    const signed = await generatePresignedUpload({
      folder,
      mimeType: parsed.data.mime_type,
      fileSize: parsed.data.size_bytes,
      originalName: parsed.data.file_name,
    });
    return NextResponse.json({
      upload_url: signed.uploadUrl,
      storage_key: signed.storageKey,
      public_url: signed.cdnUrl,
    });
  } catch (error) {
    console.error("Submission upload presign error:", error);
    return NextResponse.json({ error: "เตรียมอัปโหลดไม่สำเร็จ" }, { status: 500 });
  }
}
