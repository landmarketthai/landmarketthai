// Server-only: reads TURNSTILE_SECRET_KEY. Never import from a "use client" module.
// (The `server-only` package is not installed, so this is enforced by convention.)

export const HUMAN_TOKEN_HEADER = "x-turnstile-token";

export type HumanCheck =
  | { ok: true }
  | { ok: false; status: 403 | 503; code: "human_verification_failed" | "human_verification_unavailable"; error: string };

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const FAILED_MESSAGE = "กรุณายืนยันว่าคุณไม่ใช่บอท แล้วลองอีกครั้ง";
const UNAVAILABLE_MESSAGE = "ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง";

const failed = (): HumanCheck => ({ ok: false, status: 403, code: "human_verification_failed", error: FAILED_MESSAGE });
const unavailable = (): HumanCheck => ({ ok: false, status: 503, code: "human_verification_unavailable", error: UNAVAILABLE_MESSAGE });

let loggedMissingSecret = false;

/** Opt-in: exactly "true" (after trim). "TRUE", "1", "yes" are NOT treated as enabled. */
export function humanVerificationRequired(): boolean {
  return process.env.HUMAN_VERIFICATION_REQUIRED?.trim() === "true";
}

export async function verifyHuman(headers: Headers, remoteIp: string): Promise<HumanCheck> {
  if (!humanVerificationRequired()) return { ok: true };

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (!loggedMissingSecret) {
      loggedMissingSecret = true;
      console.error("[human-verification] HUMAN_VERIFICATION_REQUIRED=true but TURNSTILE_SECRET_KEY is not set; failing closed");
    }
    return unavailable();
  }

  const token = headers.get(HUMAN_TOKEN_HEADER)?.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return failed();

  const payload: Record<string, string> = { secret, response: token, idempotency_key: crypto.randomUUID() };
  if (remoteIp && remoteIp !== "unknown" && !remoteIp.includes("/")) payload.remoteip = remoteIp;

  let result: { success?: unknown; hostname?: unknown };
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.status !== 200) return unavailable();
    result = await response.json();
  } catch {
    return unavailable();
  }

  if (result?.success !== true) return failed();

  const allowed = (process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !(typeof result.hostname === "string" && allowed.includes(result.hostname.toLowerCase()))) return failed();

  return { ok: true };
}
