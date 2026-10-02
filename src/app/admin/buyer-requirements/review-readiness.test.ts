import test from "node:test";
import assert from "node:assert/strict";
import { buyerApprovalReadinessIssues, buyerPublishReadinessIssues } from "./review-readiness.ts";

test("admin publishing requires consent evidence and an identified review", () => {
  const ready = {
    consent_pdpa: true,
    consent_pdpa_at: "2026-10-01T00:00:00Z",
    consent_public: true,
    consent_public_at: "2026-10-01T00:00:00Z",
    reviewed_at: "2026-10-01T01:00:00Z",
    reviewed_by: "admin-id",
  };
  assert.deepEqual(buyerPublishReadinessIssues(ready), []);
  assert.deepEqual(buyerApprovalReadinessIssues({ ...ready, consent_public: false, consent_public_at: null }), []);
  assert.ok(buyerApprovalReadinessIssues({ ...ready, consent_pdpa_at: null }).length > 0);
  assert.ok(buyerApprovalReadinessIssues({ ...ready, consent_public_at: null }).length > 0);
  for (const field of ["consent_pdpa", "consent_public"] as const) {
    assert.ok(buyerPublishReadinessIssues({ ...ready, [field]: false }).length > 0, field);
  }
  for (const field of ["consent_pdpa_at", "consent_public_at", "reviewed_at", "reviewed_by"] as const) {
    assert.ok(buyerPublishReadinessIssues({ ...ready, [field]: null }).length > 0, field);
  }
  assert.ok(buyerPublishReadinessIssues({ ...ready, reviewed_by: "  " }).length > 0);
});
