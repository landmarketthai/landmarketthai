import { createHmac } from "node:crypto";
import { getSql } from "@/lib/neon/server";
import { clientIp } from "@/lib/security/client-ip";

export type RateLimitRoute = "leads" | "buyer_requirements" | "property_draft_create" | "property_draft_submit" | "submission_upload" | "lead_upload" | "maps_link" | "events";
// limit: per client per window. globalLimit: all clients combined per window (caps n8n/DB floods, far above real volume).
export const RATE_LIMITS: Record<RateLimitRoute, { limit: number; windowSeconds: number; globalLimit: number }> = {
  leads: { limit: 5, windowSeconds: 600, globalLimit: 300 },
  buyer_requirements: { limit: 6, windowSeconds: 600, globalLimit: 300 },
  property_draft_create: { limit: 10, windowSeconds: 3600, globalLimit: 500 },
  property_draft_submit: { limit: 5, windowSeconds: 600, globalLimit: 200 },
  submission_upload: { limit: 60, windowSeconds: 600, globalLimit: 2000 },
  lead_upload: { limit: 30, windowSeconds: 600, globalLimit: 1000 },
  maps_link: { limit: 30, windowSeconds: 600, globalLimit: 1500 },
  events: { limit: 300, windowSeconds: 600, globalLimit: 20000 },
};
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; degraded: boolean };

const MAX_FALLBACK_KEYS = 5_000;
const clients = new Map<string, { count: number; resetAt: number }>();
const globals = new Map<string, { count: number; resetAt: number }>();
let lastLog = 0;

// Degraded backstop only: per-instance state, so the effective ceiling scales with Vercel instances.
// Stricter than the DB limits; a full map denies NEW keys (never clear-all, which would be a bypass).
function fallbackLimit(route: RateLimitRoute, key: string): RateLimitResult {
  const { limit, windowSeconds, globalLimit } = RATE_LIMITS[route];
  const now = Date.now();
  for (const [k, v] of clients) if (v.resetAt <= now) clients.delete(k);
  const deny = (resetAt: number): RateLimitResult => ({ allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)), degraded: true });
  const entry = clients.get(key);
  if (!entry) {
    if (clients.size >= MAX_FALLBACK_KEYS) return deny(Math.min(...[...clients.values()].map((v) => v.resetAt)));
  } else if (entry.count >= Math.max(1, Math.ceil(limit / 2))) return deny(entry.resetAt);
  let global = globals.get(route);
  if (!global || global.resetAt <= now) globals.set(route, (global = { count: 0, resetAt: now + windowSeconds * 1000 }));
  if (global.count >= Math.max(1, Math.ceil(globalLimit / 10))) return deny(global.resetAt);
  global.count += 1;
  if (entry) entry.count += 1;
  else clients.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
  return { allowed: true, retryAfterSeconds: 0, degraded: true };
}

export async function checkRateLimit(route: RateLimitRoute, headers: Headers): Promise<RateLimitResult> {
  const { limit, windowSeconds, globalLimit } = RATE_LIMITS[route];
  const secret = process.env.RATE_LIMIT_SECRET || process.env.NEON_AUTH_COOKIE_SECRET || "local-public-write-rate-limit";
  const digest = createHmac("sha256", secret).update(`${route}:${clientIp(headers)}`).digest("hex");
  try {
    const rows = await getSql().query(`select consume_rate_limit($1,$2,$3,$4,$5) as retry_after`, [route, digest, limit, globalLimit, windowSeconds]);
    const retryAfter = rows[0]?.retry_after;
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
      return { allowed: retryAfter === 0, retryAfterSeconds: Math.ceil(retryAfter), degraded: false };
    }
    throw new Error("unexpected rate limit result");
  } catch {
    const now = Date.now();
    if (now - lastLog >= 60_000) {
      lastLog = now;
      console.error("[rate-limit] database limiter unavailable, using per-process fallback");
    }
    return fallbackLimit(route, `${route}:${digest}`);
  }
}
