import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-redirect";

// Legacy callback kept for old bookmarks. Neon Auth handles OAuth callbacks on its
// managed endpoint and redirects directly to the requested LandmarketThai URL.
export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
