import { NextRequest, NextResponse } from "next/server";
import { guardPublicWrite, readJsonBody, tooLargeResponse } from "@/lib/security/http";
import { insertLeadAttachment } from "@/lib/neon/mutations";
import { getStorageObjectMetadata } from "@/lib/storage/provider";
import { uploadConfirmSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const blocked = await guardPublicWrite(req, "lead_upload");
    if (blocked) return blocked;
    const { tooLarge, body } = await readJsonBody(req, 4_000);
    if (tooLarge) return tooLargeResponse();
    const result = uploadConfirmSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
    }

    const { storageKey, leadId, docType, mimeType, fileSize, originalName } = result.data;
    const expectedPrefix = `leads/${leadId}/attachments/`;
    if (!storageKey.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Storage key mismatch" }, { status: 403 });
    }

    const stored = await getStorageObjectMetadata(storageKey);
    if (!stored) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }
    if (stored.sizeBytes !== fileSize || stored.contentType !== mimeType) {
      return NextResponse.json({ error: "Uploaded file does not match" }, { status: 409 });
    }

    await insertLeadAttachment({
      leadId,
      fileName: originalName,
      storageKey,
      mimeType,
      sizeBytes: fileSize,
      docType: docType ?? "other",
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Lead upload confirm error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
