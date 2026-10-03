import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { firstParams, leadFiltersSchema } from "@/lib/operations/schemas";
import { getLeadSummary, listLeads, PAGE_SIZE } from "@/lib/operations/queries";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!isAdminUserAllowed(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const filters = leadFiltersSchema.safeParse(firstParams(request.nextUrl.searchParams));
  if (!filters.success) return NextResponse.json({ error: "ตัวกรองไม่ถูกต้อง" }, { status: 400, headers });
  try {
    const [leads, summary] = await Promise.all([listLeads(filters.data), getLeadSummary()]);
    return NextResponse.json({ leads: leads.slice(0, PAGE_SIZE), hasMore: leads.length > PAGE_SIZE, summary }, { headers });
  } catch {
    return NextResponse.json({ error: "โหลดรายการลีดไม่สำเร็จ" }, { status: 500, headers });
  }
}
