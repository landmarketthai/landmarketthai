import { NextRequest, NextResponse } from "next/server";
import { buyerRequirementSchema } from "@/lib/marketplace/schemas";
import { createBuyerRequirement } from "@/lib/neon/marketplace";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (bucket && bucket.resetAt > now && bucket.count >= 6) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  buckets.set(ip, bucket && bucket.resetAt > now ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + 60_000 });

  const body = await request.json().catch(() => null);
  const parsed = buyerRequirementSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await createBuyerRequirement(parsed.data);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Buyer requirement error:", error);
    return NextResponse.json({ error: "บันทึกความต้องการไม่สำเร็จ" }, { status: 500 });
  }
}
