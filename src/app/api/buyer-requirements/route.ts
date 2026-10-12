import { NextRequest, NextResponse } from "next/server";
import { buyerRequirementSchema } from "@/lib/marketplace/schemas";
import { createBuyerRequirement, UnknownBuyerProvinceError } from "@/lib/neon/marketplace";
import { guardPublicWrite, readJsonBody, tooLargeResponse } from "@/lib/security/http";
import type { BuyerRequirementSubmissionResult } from "@/lib/types/database";

export async function POST(request: NextRequest) {
  const blocked = await guardPublicWrite(request, "buyer_requirements", { human: true });
  if (blocked) return blocked;

  const { tooLarge, body } = await readJsonBody(request, 20_000);
  if (tooLarge) return tooLargeResponse();
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
