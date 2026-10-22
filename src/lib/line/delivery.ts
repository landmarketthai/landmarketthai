import { createHash, timingSafeEqual } from "node:crypto";

const labels = {
  buyer: "ผู้สนใจซื้อที่ดิน", owner: "เจ้าของที่ดิน", partner: "ผู้สมัครพาร์ทเนอร์",
  buyer_requirement: "ผู้ส่งความต้องการซื้อ", seller_submission: "ผู้ส่งประกาศขายที่ดิน",
} as const;
export type NotificationEvent = keyof typeof labels;
export type LineConfig = { token: string; groupId: string; siteUrl: string };
export type DeliveryResult = { status: "sent" | "retry" | "failed"; error?: string; httpStatus?: number; requestId?: string; retryAfterSeconds?: number };

export function authorizedWorker(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function lineConfig(env = process.env): LineConfig | null {
  if (env.LINE_NOTIFICATIONS_ENABLED !== "true") return null;
  const token = env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const groupId = env.LINE_NOTIFICATION_GROUP_ID?.trim();
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL || "");
    if (!token || /[\r\n]/.test(token) || !groupId || !/^C[0-9a-f]{32}$/i.test(groupId) || url.protocol !== "https:" || url.username || url.password) return null;
    return { token, groupId, siteUrl: url.origin };
  } catch { return null; }
}

export function lineRequest(event: string, config: LineConfig) {
  if (!Object.hasOwn(labels, event)) throw new Error("invalid_event");
  return { to: config.groupId, messages: [{ type: "text", text: `Landmarketthai — มีลูกค้าใหม่\n\nประเภท: ${labels[event as NotificationEvent]}\nสถานะ: รอทีมงานตรวจสอบ\n\nดูรายละเอียด:\n${config.siteUrl}/admin/leads` }] };
}

export function requestFingerprint(event: string, config: LineConfig): string {
  return createHash("sha256").update(JSON.stringify(lineRequest(event, config))).digest("hex");
}

export function retryDelay(attempt: number, retryAfterSeconds = 0): number {
  return Math.max(Math.min(3600, 30 * 2 ** (attempt - 1)), retryAfterSeconds);
}

export async function pushLine(event: string, retryKey: string, config: LineConfig, send: typeof fetch = fetch): Promise<DeliveryResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retryKey)) return { status: "failed", error: "invalid_retry_key" };
  const body = JSON.stringify(lineRequest(event, config));
  try {
    const response = await send("https://api.line.me/v2/bot/message/push", {
      method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "X-Line-Retry-Key": retryKey },
      body, signal: AbortSignal.timeout(5000), redirect: "error",
    });
    const acceptedId = response.headers.get("x-line-accepted-request-id");
    const evidence = acceptedId || response.headers.get("x-line-request-id");
    const requestId = evidence && /^[a-z0-9-]{1,100}$/i.test(evidence) ? evidence : undefined;
    const httpStatus = response.status;
    // Response bodies may echo private request data; never persist or log them.
    await response.body?.cancel();
    if (response.ok || (httpStatus === 409 && acceptedId && requestId)) return { status: "sent", httpStatus, requestId };
    if (httpStatus === 429 || httpStatus >= 500 || httpStatus === 408) {
      const header = response.headers.get("retry-after");
      const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 0;
      return { status: "retry", error: `line_http_${httpStatus}`, httpStatus, requestId,
        retryAfterSeconds: Number.isFinite(seconds) ? Math.max(0, Math.min(86400, Math.ceil(seconds))) : 0 };
    }
    return { status: "failed", error: `line_http_${httpStatus}`, httpStatus, requestId };
  } catch {
    return { status: "retry", error: "line_network_or_timeout" };
  }
}
