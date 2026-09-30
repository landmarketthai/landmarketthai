import { NextRequest, NextResponse } from "next/server";
import { createPropertyDraft } from "@/lib/neon/marketplace";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (bucket && bucket.resetAt > now && bucket.count >= 10) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  buckets.set(ip, bucket && bucket.resetAt > now ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + 60_000 });

  try {
    const draft = await createPropertyDraft();
    return NextResponse.json(draft, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Create property draft error:", error);
    return NextResponse.json({ error: "Unable to create draft" }, { status: 500 });
  }
}
