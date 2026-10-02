import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { getBuyerRequirements } from "@/lib/neon/marketplace";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const params = request.nextUrl.searchParams;
    const raw = Number(params.get("page") ?? 1);
    const page = Number.isSafeInteger(raw) && raw > 0 && raw <= Math.floor(Number.MAX_SAFE_INTEGER / 50) ? raw : 1;
    const rows = await getBuyerRequirements((page - 1) * 50, params.get("status") ?? "", params.get("id")?.trim() ?? "");
    return NextResponse.json({ requirements: rows.slice(0, 50), page, hasMore: rows.length > 50 }, { headers });
  } catch {
    return NextResponse.json({ error: "โหลดความต้องการซื้อไม่สำเร็จ" }, { status: 500, headers });
  }
}
