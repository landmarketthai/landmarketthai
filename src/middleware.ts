import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

const authMiddleware = auth.middleware({ loginUrl: "/login" });

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasOAuthVerifier = request.nextUrl.searchParams.has("neon_auth_session_verifier");
  const isProtectedAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");

  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return NextResponse.next();

  if (hasOAuthVerifier || isProtectedAdminRoute) {
    return authMiddleware(request);
  }

  return NextResponse.next();
}

// Only admin pages and OAuth callbacks need Neon Auth; public pages and SEO routes
// must never depend on the auth module loading.
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    { source: "/:path*", has: [{ type: "query", key: "neon_auth_session_verifier" }] },
  ],
};
