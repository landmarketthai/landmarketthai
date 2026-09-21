import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ATTRIBUTION_MAX_AGE_SECONDS,
  ATTRIBUTION_SOURCE_COOKIE,
  REFERRAL_COOKIE,
  referralCodeFromUrl,
  trackingSourceFromUrl,
} from "@/lib/lead-attribution";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

function applyAttributionCookies(response: NextResponse, request: NextRequest) {
  const referralCode = referralCodeFromUrl(request.url);
  const source = trackingSourceFromUrl(request.url);
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
  };

  if (referralCode && !request.cookies.get(REFERRAL_COOKIE)?.value) {
    response.cookies.set(REFERRAL_COOKIE, referralCode, options);
  }
  if (source && !request.cookies.get(ATTRIBUTION_SOURCE_COOKIE)?.value) {
    response.cookies.set(ATTRIBUTION_SOURCE_COOKIE, source, options);
  }
}

export async function middleware(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) {
    const response = NextResponse.next({ request });
    applyAttributionCookies(response, request);
    return response;
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session — do NOT remove this call.
  await supabase.auth.getUser();
  applyAttributionCookies(supabaseResponse, request);

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|icons/).*)"],
};
