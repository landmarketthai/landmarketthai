const BASE = "https://landmarketthai.invalid";

/**
 * Returns a same-origin path ("/x?y#z") safe for router.replace / redirect / OAuth callbackURL, else "/".
 * Hard-fails on anything a browser could read as another origin: "//x", "/\x", "/.//x", "/%5Cx",
 * whitespace/control chars (URL parsers strip them, "/\t/x" becomes "//x") and raw non-ASCII.
 * Non-ASCII paths must arrive percent-encoded. "/login" maps to "/" to avoid a login loop.
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2048 || !/^\/[\x21-\x5b\x5d-\x7e]*$/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return "/";
  }
  // Encoded "/", "\", dot segments or controls in the path can be decoded downstream into "//host" or "/\host".
  if (/\/\/|\\|\/\.\.?(?:\/|$)|[\x00-\x1f\x7f]/.test(decodedPath)) return "/";
  const path = url.pathname + url.search + url.hash;
  if (!/^\/(?![\/\\])/.test(path) || /^\/login\/?$/.test(url.pathname)) return "/";
  return path;
}
