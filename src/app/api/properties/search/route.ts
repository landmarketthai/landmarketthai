import { NextRequest, NextResponse } from "next/server";
import { searchProperties, type PropertySearchFilters } from "@/lib/neon/queries";

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyType = params.get("property_type");
  const transactionType = params.get("transaction_type");
  const eec = params.get("eec");

  const filters: PropertySearchFilters = {
    q: params.get("q") || undefined,
    province_slug: params.get("province") || undefined,
    district: params.get("district") || undefined,
    property_type:
      propertyType === "land" || propertyType === "factory" || propertyType === "warehouse"
        ? propertyType
        : undefined,
    transaction_type: transactionType === "rent" ? "rent" : transactionType === "sale" ? "sale" : undefined,
    min_price: numberParam(params, "min_price"),
    max_price: numberParam(params, "max_price"),
    min_price_per_rai: numberParam(params, "min_price_per_rai"),
    max_price_per_rai: numberParam(params, "max_price_per_rai"),
    min_size_rai: numberParam(params, "min_size_rai"),
    max_size_rai: numberParam(params, "max_size_rai"),
    zoning: params.get("zoning") || undefined,
    eec: eec === "1" ? true : eec === "0" ? false : undefined,
    west: numberParam(params, "west"),
    south: numberParam(params, "south"),
    east: numberParam(params, "east"),
    north: numberParam(params, "north"),
    limit: Math.min(numberParam(params, "limit") ?? 24, 100),
    offset: Math.max(numberParam(params, "offset") ?? 0, 0),
  };

  try {
    const properties = await searchProperties(filters);
    return NextResponse.json(
      { properties },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (error) {
    console.error("Property search error:", error);
    return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  }
}
