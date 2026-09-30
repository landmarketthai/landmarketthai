import test from "node:test";
import assert from "node:assert/strict";
import { classifyBuyerMatch } from "./matching.ts";
import { submissionReadinessIssues } from "./submission-readiness.ts";
import { SEED_PUBLIC_LISTINGS } from "../seed-listings.ts";
import { sortPropertyResults } from "./search-sort.ts";
import { buyerRequirementSchema, draftSchema } from "./schemas.ts";
import type { PropertySubmission } from "../types/database.ts";

const rayong = SEED_PUBLIC_LISTINGS.find((property) => property.slug === "37-rai-eec-rayong");
if (!rayong) throw new Error("37-rai Rayong seed listing is required for marketplace tests");

test("buyer matching keeps exact geography and separates full vs near", () => {
  const base = {
    property_type: "land" as const,
    transaction_type: "sale" as const,
    preferred_locations: ["ระยอง"],
    province_ids: [rayong.province_id],
    min_size_rai: 30,
    max_size_rai: 50,
    max_price: 100_000_000,
    max_price_per_rai: 3_000_000,
    zoning: null,
  };

  assert.equal(classifyBuyerMatch(rayong, base), "full");
  assert.equal(classifyBuyerMatch(rayong, { ...base, max_price: 1_000_000 }), "near");
  assert.equal(classifyBuyerMatch(rayong, { ...base, province_ids: ["00000000-0000-0000-0000-000000000000"] }), null);
});

test("buyer matching never returns sold inventory", () => {
  const sold = SEED_PUBLIC_LISTINGS.find((property) => property.status === "sold");
  assert.ok(sold);
  assert.equal(classifyBuyerMatch(sold, {
    transaction_type: sold.transaction_type,
    preferred_locations: [],
    province_ids: [],
  }), null);
});

test("search sorting keeps active inventory ahead of sold inventory", () => {
  const sorted = sortPropertyResults(SEED_PUBLIC_LISTINGS, "price_desc");
  const firstSoldIndex = sorted.findIndex((property) => property.status === "sold");
  assert.ok(firstSoldIndex > 0);
  assert.ok(sorted.slice(0, firstSoldIndex).every((property) => property.status === "active"));
});

test("seller readiness rejects zero price and zero area", () => {
  const draft = {
    property_type: "land",
    transaction_type: "sale",
    title: "ทรัพย์ทดสอบ",
    province_id: rayong.province_id,
    total_rai: 0,
    contact_name: "เจ้าของทรัพย์",
    contact_phone: "0812345678",
    sale_price: 0,
  } as PropertySubmission;

  const issues = submissionReadinessIssues(draft);
  assert.ok(issues.includes("ขนาดพื้นที่"));
  assert.ok(issues.includes("ราคาขาย"));
});

test("sale-only schemas reject rental transactions", () => {
  const draft = draftSchema.safeParse({
    token: "00000000-0000-4000-8000-000000000000",
    transaction_type: "rent",
  });
  const buyer = buyerRequirementSchema.safeParse({
    transaction_type: "rent",
    preferred_locations: [],
    province_ids: [],
    name: "ผู้ซื้อทดสอบ",
    phone: "0812345678",
    consent_pdpa: true,
  });

  assert.equal(draft.success, false);
  assert.equal(buyer.success, false);
});

test("seller readiness accepts a complete positive sale draft", () => {
  const draft = {
    property_type: "land",
    transaction_type: "sale",
    title: "ทรัพย์ทดสอบ",
    province_id: rayong.province_id,
    total_rai: 10,
    contact_name: "เจ้าของทรัพย์",
    contact_phone: "0812345678",
    sale_price: 20_000_000,
  } as PropertySubmission;

  assert.deepEqual(submissionReadinessIssues(draft), []);
});
