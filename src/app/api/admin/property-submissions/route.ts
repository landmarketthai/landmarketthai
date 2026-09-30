import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { listReviewSubmissions } from "@/lib/neon/marketplace";

export async function GET(request: NextRequest) {
  if (!await getAdminUser(request.headers)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ submissions: await listReviewSubmissions() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin property list error:", error);
    return NextResponse.json({ error: "โหลดรายการไม่สำเร็จ" }, { status: 500 });
  }
}
