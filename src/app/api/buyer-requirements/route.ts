import { NextRequest, NextResponse } from "next/server";
import { buyerRequirementSchema } from "@/lib/marketplace/schemas";
import { createBuyerRequirement, UnknownBuyerProvinceError } from "@/lib/neon/marketplace";
import { allowBuyerSubmission } from "@/lib/neon/buyer-rate-limit";
import type { BuyerRequirementSubmissionResult } from "@/lib/types/database";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!await allowBuyerSubmission(ip)) return NextResponse.json({ error: "ส่งคำขอบ่อยเกินไป กรุณารอ 1 นาที", code: "rate_limited" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = buyerRequirementSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await createBuyerRequirement(parsed.data);
    const response: BuyerRequirementSubmissionResult = { status: "pending_review", matches: result.matches };
    return NextResponse.json(response, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnknownBuyerProvinceError) return NextResponse.json({ error: "จังหวัดที่เลือกไม่ถูกต้อง กรุณาโหลดตัวเลือกใหม่", field: "province_ids" }, { status: 400 });
    console.error("Buyer requirement could not be saved");
    return NextResponse.json({ error: "บันทึกความต้องการไม่สำเร็จ" }, { status: 500 });
  }
}
