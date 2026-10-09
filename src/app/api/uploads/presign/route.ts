import { NextRequest, NextResponse } from "next/server";
import { guardPublicWrite, readJsonBody, tooLargeResponse } from "@/lib/security/http";
import { leadExists } from "@/lib/neon/mutations";
import { generatePresignedUpload } from "@/lib/storage/provider";
import type { StorageFolder } from "@/lib/storage/provider";
import { presignSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const blocked = await guardPublicWrite(req, "lead_upload");
    if (blocked) return blocked;
    const { tooLarge, body } = await readJsonBody(req, 4_000);
    if (tooLarge) return tooLargeResponse();
    const result = presignSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
    }

    const { leadId, mimeType, fileSize, originalName } = result.data;

    if (!(await leadExists(leadId))) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const folder: StorageFolder = `leads/${leadId}/attachments`;
    const { uploadUrl, storageKey } = await generatePresignedUpload({
      folder,
      mimeType,
      fileSize,
      originalName,
    });

    return NextResponse.json({ uploadUrl, storageKey });
  } catch (error: unknown) {
    // Only the provider's own validation messages are user-facing; never echo SDK/DB errors.
    const message = error instanceof Error && /^File (type not allowed|too large)/.test(error.message) ? error.message : null;
    if (!message) console.error("Lead upload presign error:", error);
    return NextResponse.json({ error: message ?? "Server error" }, { status: message ? 400 : 500 });
  }
}
