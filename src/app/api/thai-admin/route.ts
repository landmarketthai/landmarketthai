import { NextRequest, NextResponse } from "next/server";
import { getAdminOptions } from "@/lib/thai-admin";

// Dependent province/district/subdistrict options from the vendored Open Admin Data dataset (CC-BY-4.0).
export async function GET(request: NextRequest) {
  const province = request.nextUrl.searchParams.get("province")?.slice(0, 80) ?? "";
  const district = request.nextUrl.searchParams.get("district")?.slice(0, 120) ?? null;
  if (!province.trim()) return NextResponse.json({ error: "province is required" }, { status: 400 });
  const options = getAdminOptions(province, district);
  if (!options.province) return NextResponse.json({ error: "Unknown province" }, { status: 404 });
  return NextResponse.json(options, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
}
