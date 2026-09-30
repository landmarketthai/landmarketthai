import assert from "node:assert/strict";
import test from "node:test";
import { isVerified, verificationUpdate } from "@/lib/verification";

const reviewer = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-30T10:00:00.000Z");

test("only a recorded human review produces a badge; seeds and publication alone do not", () => {
  assert.equal(isVerified(undefined), false);
  assert.equal(isVerified(null), false);
  assert.equal(isVerified({}), false);
  assert.equal(isVerified({ verified_at: now.toISOString() }), false);
  assert.equal(isVerified({ verified_by: reviewer }), false);
  assert.equal(isVerified({ verified_by: reviewer, verified_at: "not-a-date" }), false);
  assert.equal(isVerified(verificationUpdate("verify", reviewer, now)), true);
});

test("grant records the authenticated reviewer and revoke removes both badge fields", () => {
  assert.deepEqual(verificationUpdate("verify", reviewer, now), { verified_at: now.toISOString(), verified_by: reviewer });
  assert.deepEqual(verificationUpdate("revoke", reviewer, now), { verified_at: null, verified_by: null });
  assert.equal(isVerified(verificationUpdate("revoke", reviewer, now)), false);
});

test("verification rejects invented decisions and unauthenticated reviewer values", () => {
  for (const decision of [null, undefined, "active", "on", true]) assert.throws(() => verificationUpdate(decision, reviewer, now));
  for (const invalid of ["", "public", "admin@example.com"]) assert.throws(() => verificationUpdate("verify", invalid, now));
});
