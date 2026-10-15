import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the unmodified request body before it is parsed. */
export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string | undefined): boolean {
  if (!channelSecret || !signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Extract only group destinations; never retain message text, user IDs, or profile data. */
export function extractLineGroupIds(rawBody: string): string[] {
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return []; }
  if (!payload || typeof payload !== "object") return [];
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  const ids = new Set<string>();
  for (const event of events.slice(0, 15)) {
    if (!event || typeof event !== "object") continue;
    const source = (event as {source?: unknown}).source;
    if (!source || typeof source !== "object") continue;
    const s = source as { type?: unknown; groupId?: unknown };
    if (s.type === "group" && typeof s.groupId === "string" && /^C[0-9a-f]{32}$/i.test(s.groupId)) ids.add(s.groupId);
  }
  return [...ids];
}
