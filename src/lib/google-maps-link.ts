import { coordinateIssues } from "@/lib/marketplace/listing-workflow";

export type MapsCoordinates = { lat: number; lng: number };

export type MapsLinkResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; error: string };

export const MAPS_LINK_ERRORS = {
  empty: "กรุณาวางลิงก์ Google Maps หรือพิกัด",
  unsupported: "รองรับเฉพาะลิงก์ Google Maps หรือพิกัดรูปแบบ ละติจูด,ลองจิจูด",
  noCoordinates: "ลิงก์นี้ไม่มีพิกัดตำแหน่ง กรุณาเปิดใน Google Maps แล้วกดค้างที่หมุดเพื่อคัดลอกพิกัด หรือปักหมุดบนแผนที่แทน",
  outsideThailand: "พิกัดอยู่นอกประเทศไทย กรุณาตรวจสอบลิงก์อีกครั้ง",
  unreachable: "เปิดลิงก์ย่อไม่สำเร็จ กรุณาลองใหม่ หรือวางพิกัดแทน",
} as const;

const NUMBER = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const RAW_PAIR = new RegExp(String.raw`^\s*${NUMBER}\s*,\s*${NUMBER}\s*$`);
// Order matters: !3d!4d is the dropped pin on place URLs, @lat,lng is only the viewport center.
const URL_PATTERNS = [
  new RegExp(String.raw`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(String.raw`/maps/(?:place|search|dir)/(?:[^/]*/)*?${NUMBER},[+\s]*${NUMBER}(?:[/?,]|$)`),
  new RegExp(String.raw`@${NUMBER},${NUMBER}`),
];
const QUERY_KEYS = ["q", "query", "ll", "center", "destination", "daddr"];

/** Short-link hosts whose redirects are followed server-side. */
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|co\.th)$/;

/** Only Google Maps URLs are accepted; anything else is never fetched or parsed (SSRF guard). */
export function isAllowedMapsUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps/");
  if (!GOOGLE_HOST.test(host)) return false;
  return host.startsWith("maps.") || url.pathname === "/maps" || url.pathname.startsWith("/maps/");
}

export function isShortMapsUrl(url: URL): boolean {
  return isAllowedMapsUrl(url) && SHORT_HOSTS.has(url.hostname.toLowerCase());
}

function pair(lat: string, lng: string): MapsCoordinates | null {
  // Range checks happen in toThaiCoordinates so swapped or foreign pairs get a clear "outside Thailand" error.
  const value = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) ? value : null;
}

/** Extracts coordinates from an allowlisted, already-expanded Google Maps URL. Never geocodes place names. */
export function coordinatesFromMapsUrl(url: URL): MapsCoordinates | null {
  for (const key of QUERY_KEYS) {
    const match = url.searchParams.get(key)?.match(RAW_PAIR);
    if (match) return pair(match[1], match[2]);
  }
  let text = url.pathname + url.search + url.hash;
  try { text = decodeURIComponent(text); } catch { /* keep raw text */ }
  for (const pattern of URL_PATTERNS) {
    const match = text.match(pattern);
    if (match) return pair(match[1], match[2]);
  }
  return null;
}

/** Validates coordinates against the same Thailand bounds used for publishing; rounds to the DB's 7 decimals. */
export function toThaiCoordinates(value: MapsCoordinates | null): MapsLinkResult {
  if (!value) return { ok: false, error: MAPS_LINK_ERRORS.noCoordinates };
  if (coordinateIssues(value).length) return { ok: false, error: MAPS_LINK_ERRORS.outsideThailand };
  const round = (n: number) => Math.round(n * 1e7) / 1e7;
  return { ok: true, lat: round(value.lat), lng: round(value.lng) };
}

export type ParsedMapsInput =
  | { kind: "coordinates"; value: MapsCoordinates | null }
  | { kind: "url"; url: URL }
  | { kind: "invalid" };

/** Accepts raw "lat,lng" or the first allowlisted Google Maps URL inside pasted text. */
export function parseMapsInput(input: string): ParsedMapsInput {
  const trimmed = input.trim();
  const raw = trimmed.match(RAW_PAIR);
  if (raw) return { kind: "coordinates", value: pair(raw[1], raw[2]) };
  const candidate = trimmed.match(/https?:\/\/\S+/i)?.[0] ?? (/^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.)/i.test(trimmed) ? `https://${trimmed}` : null);
  if (!candidate) return { kind: "invalid" };
  try {
    const url = new URL(candidate);
    return isAllowedMapsUrl(url) ? { kind: "url", url } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

/**
 * Resolves pasted input to Thai coordinates. Short links are expanded by following redirects
 * manually, re-checking the allowlist on every hop, so no arbitrary URL is ever requested.
 */
export async function resolveMapsInput(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MapsLinkResult> {
  if (!input.trim()) return { ok: false, error: MAPS_LINK_ERRORS.empty };
  const parsed = parseMapsInput(input);
  if (parsed.kind === "invalid") return { ok: false, error: MAPS_LINK_ERRORS.unsupported };
  if (parsed.kind === "coordinates") return toThaiCoordinates(parsed.value);

  let url = parsed.url;
  for (let hop = 0; isShortMapsUrl(url); hop++) {
    if (hop >= 5) return { ok: false, error: MAPS_LINK_ERRORS.unreachable };
    let location: string | null;
    try {
      url.protocol = "https:";
      const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000), cache: "no-store" });
      location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    } catch {
      return { ok: false, error: MAPS_LINK_ERRORS.unreachable };
    }
    if (!location) return { ok: false, error: MAPS_LINK_ERRORS.unreachable };
    try { url = new URL(location, url); } catch { return { ok: false, error: MAPS_LINK_ERRORS.unsupported }; }
    if (!isAllowedMapsUrl(url)) return { ok: false, error: MAPS_LINK_ERRORS.noCoordinates };
  }
  return toThaiCoordinates(coordinatesFromMapsUrl(url));
}
