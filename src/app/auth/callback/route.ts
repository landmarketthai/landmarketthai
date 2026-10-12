import { NextResponse } from "next/server";

// Legacy callback kept for old bookmarks. Neon Auth handles OAuth callbacks on its
// managed endpoint and redirects directly to the requested LandmarketThai URL.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedNext = url.searchParams.get("next") ?? "/";
  // Resolve first, then compare origins: "/\t/evil.com" passes a prefix check but resolves off-site.
  const target = requestedNext.startsWith("/") ? new URL(requestedNext, url.origin) : null;

  return NextResponse.redirect(target?.origin === url.origin ? target : new URL("/", url.origin));
}
