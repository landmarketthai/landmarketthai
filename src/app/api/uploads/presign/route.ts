import { NextRequest, NextResponse } from "next/server";
import { leadExists } from "@/lib/neon/mutations";
import { generatePresignedUpload } from "@/lib/storage/provider";
import type { StorageFolder } from "@/lib/storage/provider";
import { presignSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
