import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buyerRequirementSchema, submitDraftSchema, type BuyerRequirementInput } from "./marketplace/schemas.ts";
import type { BuyerRequirement, BuyerRequirementSubmissionResult } from "./types/database.ts";

const contact = { name: "ผู้ซื้อทดสอบ", phone: "+66 81-234-5678", consent_pdpa: true };

test("property referrals preserve a validated public reference and offer a copyable LINE reference", () => {
  const slug = "buyer-demand-00000000-0000-4000-8000-000000000001";
  const input = { token: "00000000-0000-4000-8000-000000000002", consent_pdpa: true, buyer_demand_slug: slug };
  assert.equal(submitDraftSchema.parse(input).buyer_demand_slug, slug);
  assert.equal(submitDraftSchema.safeParse({ ...input, buyer_demand_slug: "private free text" }).success, false);
  const detail = readFileSync(new URL("../app/buyer-demand/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(detail, /\/sell\?buyer_demand=\$\{encodeURIComponent\(demand.slug\)\}/);
  assert.match(detail, /readOnly value=\{demand.slug\}/);
  assert.doesNotMatch(detail, /ส่งข้อมูลที่ดิน|เจ้าของที่ดิน/);
  const wizard = readFileSync(new URL("../components/forms/SellWizard.tsx", import.meta.url), "utf8");
  assert.match(wizard, /buyer_demand_slug: buyerDemandSlug/);
  const route = readFileSync(new URL("../app/api/property-submissions/[id]/submit/route.ts", import.meta.url), "utf8");
  assert.match(route, /source: parsed.data.buyer_demand_slug \? `\/buyer-demand\/\$\{parsed.data.buyer_demand_slug\}`/);
});

test("buyer input defaults to sale and private review without public consent", () => {
  const input: BuyerRequirementInput = buyerRequirementSchema.parse(contact);
  assert.equal(input.transaction_type, "sale");
  assert.equal(input.phone, "0812345678");
  assert.equal(input.consent_public, false);
  assert.deepEqual(input.province_ids, []);
  assert.deepEqual(input.preferred_locations, []);
});

test("buyer input accepts the complete form contract and preserves false and zero", () => {
  const input = buyerRequirementSchema.parse({
    ...contact, property_type: "factory", transaction_type: "sale",
    province_ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
    preferred_locations: [" นิคมพัฒนา "], min_size_rai: 0, max_size_rai: 10.5,
    max_price: 20_000_000, max_price_per_rai: 2_000_000, zoning: "purple",
    purpose: " โรงงาน ", container_access: true, high_voltage: false,
    water_requirement: " น้ำประปา ", special_requirements: " รายละเอียดส่วนตัว ",
    line_id: " buyer-line ", consent_public: true,
  });
  const compatible: Partial<BuyerRequirement> = input;
  assert.equal(compatible.min_size_rai, 0);
  assert.equal(input.high_voltage, false);
  assert.equal(input.purpose, "โรงงาน");
  assert.equal(input.line_id, "buyer-line");
  assert.deepEqual(input.preferred_locations, ["นิคมพัฒนา"]);
  assert.equal(input.province_ids.length, 2);
});

test("buyer input rejects malformed values and client workflow overrides", () => {
  for (const override of [
    { transaction_type: "rent" }, { property_type: "industrial" }, { zoning: "invalid" },
    { consent_pdpa: false }, { consent_pdpa: "true" }, { consent_public: "false" },
    { name: "  " }, { phone: "abc" }, { phone: "0".repeat(33) },
    { container_access: "false" }, { high_voltage: 1 },
    { province_ids: ["rayong"] }, { province_ids: Array(11).fill("00000000-0000-4000-8000-000000000001") },
    { province_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"] },
    { preferred_locations: [" "] }, { preferred_locations: Array(11).fill("ระยอง") },
    { min_size_rai: 11, max_size_rai: 10 }, { min_size_rai: 0.123456 }, { max_price: 10.001 },
    { purpose: "x".repeat(1001) },
    { water_requirement: "x".repeat(1001) }, { special_requirements: "x".repeat(2001) },
    { line_id: "x".repeat(101) }, { status: "published" }, { published_at: "2026-10-01" },
  ]) assert.equal(buyerRequirementSchema.safeParse({ ...contact, ...override }).success, false);
  for (const key of ["min_size_rai", "max_size_rai", "max_price", "max_price_per_rai"]) {
    for (const value of [true, false, [], {}, "10", "", -1, NaN, Infinity, 1e14]) {
      assert.equal(buyerRequirementSchema.safeParse({ ...contact, [key]: value }).success, false, `${key}: ${String(value)}`);
    }
    assert.equal(buyerRequirementSchema.safeParse({ ...contact, [key]: null }).success, true);
  }
});

test("form and API keep review status explicit and validate before serialization", () => {
  const status: BuyerRequirementSubmissionResult["status"] = "pending_review";
  const form = readFileSync(new URL("../components/forms/BuyerRequirementForm.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/buyer-requirements/route.ts", import.meta.url), "utf8");
  assert.ok(form.indexOf("buyerRequirementSchema.safeParse") < form.indexOf("JSON.stringify(parsed.data)"));
  assert.match(form, /province_ids: form\.province_ids/);
  assert.match(form, /body\?\.status !== "pending_review"/);
  assert.doesNotMatch(form, /requirementId|body\??\.id|Ref /);
  assert.doesNotMatch(api, /id: result\.id/);
  assert.match(form, /finally \{ saving\.current = false; setBusy\(false\); \}/);
  assert.match(form, /รอตรวจสอบ.*ยังไม่เผยแพร่/);
  assert.match(api, new RegExp(`status: "${status}"`));
  for (const name of ["property_type", "province_ids", "preferred_locations", "min_size_rai", "max_size_rai", "max_price", "max_price_per_rai", "zoning", "purpose", "container_access", "high_voltage", "water_requirement", "special_requirements", "name", "phone", "line_id", "consent_pdpa", "consent_public"]) {
    assert.ok(form.includes(`name="${name}"`), name);
  }
  assert.match(form, /name="province_ids"[^>]*value=\{province\.id\}/);
  assert.doesNotMatch(api, /console\.error\([^;]*\berror\)/);
});
