import assert from "node:assert/strict";
import test from "node:test";
import { parseBangkokDateTimeLocal } from "@/lib/lead-crm";

test("parses Bangkok datetime-local without a 7-hour shift", () => {
  assert.equal(parseBangkokDateTimeLocal("2026-09-21T18:30"), "2026-09-21T11:30:00.000Z");
});

test("blank follow-up clears the schedule", () => {
  assert.equal(parseBangkokDateTimeLocal("   "), null);
});

test("rejects impossible or malformed local dates", () => {
  assert.throws(() => parseBangkokDateTimeLocal("2026-02-31T10:00"));
  assert.throws(() => parseBangkokDateTimeLocal("2026/09/21 10:00"));
});
