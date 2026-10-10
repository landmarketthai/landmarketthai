import { NextResponse } from "next/server";
import { clientIp } from "@/lib/security/client-ip";
import { verifyHuman } from "@/lib/security/human-verification";
import { checkRateLimit, type RateLimitRoute } from "@/lib/security/rate-limit";

const noStore = { "Cache-Control": "no-store" };

// ponytail: buffers up to the claimed cap (Vercel already rejects bodies > 4.5 MB); stream-abort if caps grow.
export async function readJsonBody(request: Request, maxBytes: number): Promise<{ tooLarge: boolean; body: unknown }> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return { tooLarge: true, body: null };
  const text = await request.text().catch(() => "");
  if (Buffer.byteLength(text) > maxBytes) return { tooLarge: true, body: null };
  try {
    return { tooLarge: false, body: JSON.parse(text) };
  } catch {
    return { tooLarge: false, body: null };
  }
}

export function tooLargeResponse() {
  return NextResponse.json({ error: "ข้อมูลมีขนาดใหญ่เกินไป", code: "payload_too_large" }, { status: 413, headers: noStore });
}

// Human check first (a no-op unless HUMAN_VERIFICATION_REQUIRED=true, or "strict" on Vercel Production) so bots
// without a valid token cannot burn the shared per-route ceiling and lock out real users. Returns a response to send, or null.
export async function guardPublicWrite(request: Request, route: RateLimitRoute, options: { human?: boolean | "strict" } = {}) {
  if (options.human) {
    const human = await verifyHuman(request.headers, clientIp(request.headers), options.human === "strict");
    if (!human.ok) return NextResponse.json({ error: human.error, code: human.code }, { status: human.status, headers: noStore });
  }
  const limit = await checkRateLimit(route, request.headers);
  if (limit.allowed) return null;
  return NextResponse.json(
    { error: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", code: "rate_limited" },
    { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfterSeconds) } },
  );
}
