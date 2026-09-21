import assert from "node:assert/strict";
import test from "node:test";
import { buyerLeadSchema } from "@/lib/validations";

const base = {
  name: "Buyer Test",
  phone: "0812345678",
  consent_pdpa: true,
};

test("buyer requirement accepts a valid size and budget range", () => {
  const result = buyerLeadSchema.safeParse({
    ...base,
    province: "ระยอง",
    land_type: "industrial",
    size_min_rai: 20,
    size_max_rai: 50,
    budget_min: 50_000_000,
    budget_max: 100_000_000,
  });
  assert.equal(result.success, true);
});

test("buyer requirement rejects inverted size range", () => {
  const result = buyerLeadSchema.safeParse({ ...base, size_min_rai: 50, size_max_rai: 20 });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.flatten().fieldErrors.size_max_rai?.length);
});

test("buyer requirement rejects inverted budget range", () => {
  const result = buyerLeadSchema.safeParse({ ...base, budget_min: 100_000_000, budget_max: 50_000_000 });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.flatten().fieldErrors.budget_max?.length);
});
