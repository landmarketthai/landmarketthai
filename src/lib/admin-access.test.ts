import assert from "node:assert/strict";
import test from "node:test";
import { isAdminEmail } from "@/lib/admin-access";

test("admin allowlist is fail-closed and case-insensitive", () => {
  assert.equal(isAdminEmail("admin@example.com", undefined), false);
  assert.equal(isAdminEmail("admin@example.com", ""), false);
  assert.equal(isAdminEmail(undefined, "admin@example.com"), false);
  assert.equal(isAdminEmail(" ADMIN@example.com ", "admin@example.com, ops@example.com"), true);
  assert.equal(isAdminEmail("ops@example.com", "admin@example.com; OPS@example.com"), true);
  assert.equal(isAdminEmail("other@example.com", "admin@example.com ops@example.com"), false);
});
