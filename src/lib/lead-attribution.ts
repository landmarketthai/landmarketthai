export const REFERRAL_COOKIE = "lmt_ref";
export const ATTRIBUTION_SOURCE_COOKIE = "lmt_source";
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function referralCodeFromUrl(url: string): string | undefined {
  const parsed = new URL(url, "https://landmarketthai.com");
  const value = parsed.searchParams.get("ref")?.trim();
  if (!value) return undefined;
  return value.slice(0, 100);
}

export function leadSourceFromUrl(url: string): string {
  const parsed = new URL(url, "https://landmarketthai.com");
  const tracking = new URLSearchParams();

  for (const key of TRACKING_KEYS) {
    const value = parsed.searchParams.get(key)?.trim();
    if (value) tracking.set(key, value.slice(0, 100));
  }

  const query = tracking.toString();
  return query ? `${parsed.pathname}?${query}`.slice(0, 500) : parsed.pathname.slice(0, 500);
}

export function trackingSourceFromUrl(url: string): string | undefined {
  const source = leadSourceFromUrl(url);
  return source.includes("?") ? source : undefined;
}
