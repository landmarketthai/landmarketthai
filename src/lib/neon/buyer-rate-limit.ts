import { createHmac } from "node:crypto";
import { getSql } from "@/lib/neon/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function allowBuyerSubmission(identifier: string): Promise<boolean> {
  const now = Date.now();
  const digest = createHmac("sha256", process.env.NEON_AUTH_COOKIE_SECRET || "local-buyer-rate-limit")
    .update(`${Math.floor(now / 86_400_000)}:${identifier.slice(0, 200)}`).digest("hex");
  try {
    const rows = await getSql().query(`select allow_buyer_submission($1) as allowed`, [digest]);
    return rows[0]?.allowed === true;
  } catch {
    // ponytail: DB-outage fallback is per-process, capped at 10,000 digests for one minute.
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
    const bucket = buckets.get(digest);
    if ((!bucket && buckets.size >= 10_000) || (bucket && bucket.count >= 6)) return false;
    buckets.set(digest, bucket ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + 60_000 });
    return true;
  }
}
