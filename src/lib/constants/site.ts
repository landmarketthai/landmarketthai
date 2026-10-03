export const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_URL ?? "https://lin.ee/8p064f7";
export function canonicalSiteUrl(value?: string): string {
  const fallback = "https://www.landmarketthai.com";
  try {
    const url = new URL(value ?? fallback);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return fallback;
    if (["landmarketthai.com", "www.landmarketthai.com"].includes(url.hostname)) return fallback;
    return url.origin;
  } catch { return fallback; }
}

export const SITE_URL = canonicalSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
