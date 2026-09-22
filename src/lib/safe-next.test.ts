import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "@/lib/safe-next";

test("accepts same-site paths", () => {
  assert.equal(safeNextPath("/admin/leads"), "/admin/leads");
});

test("rejects protocol-relative and absolute URLs", () => {
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
});

test("uses fallback for missing values", () => {
  assert.equal(safeNextPath(null, "/admin"), "/admin");
});
