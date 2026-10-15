import { NextRequest, NextResponse } from "next/server";
import { extractLineGroupIds, verifyLineSignature } from "@/lib/line/uat-webhook";

export const runtime = "nodejs";

const noCache = { "Cache-Control": "no-store" };
/** Temporary PREVIEW ONLY capture endpoint. No production changes, persistence, or outbound messages. */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" || !process.env.LINE_CHANNEL_SECRET) {
    return NextResponse.json({ error: "Not Found" }, { status: 404, headers: noCache });
  }
  if (Number(request.headers.get("content-length") || 0) > 65_536) {
    return NextResponse.json({ error: "Too Large" }, { status: 413, headers: noCache });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 65_536) {
    return NextResponse.json({ error: "Too Large" }, { status: 413, headers: noCache });
  }
  if (!verifyLineSignature(raw, request.headers.get("x-line-signature"), process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers: noCache });
  }

  // Verified metadata only. No message body or user ID is ever logged.
  for (const groupId of extractLineGroupIds(raw)) console.info("[LINE_UAT_VERIFIED_GROUP_ID]", groupId);
  return NextResponse.json({ ok: true }, { status: 200, headers: noCache });
}
