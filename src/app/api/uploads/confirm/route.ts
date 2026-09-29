import { NextRequest, NextResponse } from "next/server";
import { insertLeadAttachment } from "@/lib/neon/mutations";
import { headStorageObject } from "@/lib/storage/provider";
import { uploadConfirmSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = uploadConfirmSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
    }

    const { storageKey, leadId, docType, mimeType, fileSize, originalName } = result.data;
    const expectedPrefix = `leads/${leadId}/attachments/`;
    if (!storageKey.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Storage key mismatch" }, { status: 403 });
    }

    const exists = await headStorageObject(storageKey);
    if (!exists) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
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
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
