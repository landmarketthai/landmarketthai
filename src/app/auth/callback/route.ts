import { NextResponse } from "next/server";

// Legacy callback kept for old bookmarks. Neon Auth handles OAuth callbacks on its
// managed endpoint and redirects directly to the requested LandmarketThai URL.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedNext = url.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";

  return NextResponse.redirect(new URL(next, url.origin));
}
