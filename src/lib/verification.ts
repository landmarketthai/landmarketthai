interface Verification {
  verified_at?: string | null;
  verified_by?: string | null;
}

export function isVerified(record: Verification | null | undefined): boolean {
  return Boolean(record?.verified_by && record.verified_at && Number.isFinite(Date.parse(record.verified_at)));
}

export function verificationUpdate(decision: unknown, reviewerId: string, now = new Date()) {
  if (decision !== "verify" && decision !== "revoke") throw new Error("Invalid verification decision");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewerId)) {
    throw new Error("Invalid reviewer");
  }
  return decision === "verify"
    ? { verified_at: now.toISOString(), verified_by: reviewerId }
    : { verified_at: null, verified_by: null };
}
