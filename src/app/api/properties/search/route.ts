import { NextRequest, NextResponse } from "next/server";
import { searchProperties } from "@/lib/neon/queries";
import { MAX_SEARCH_OFFSET, parsePropertySearchParams } from "@/lib/marketplace/search-filters";

export async function GET(request: NextRequest) {
  const filters = parsePropertySearchParams(request.nextUrl.searchParams);
  if ((filters.offset ?? 0) > MAX_SEARCH_OFFSET) {
    return NextResponse.json({ error: `offset must be <= ${MAX_SEARCH_OFFSET}` }, { status: 400 });
  }
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
