import assert from "node:assert/strict";
import test from "node:test";
import { getZoning, zoningSchema, zoningColors, zoningSummary, listingMetadataDescription, zoningFromForm, ZONING_NOTICE } from "@/lib/zoning";
import { draftSchema } from "@/lib/marketplace/schemas";
import { SEED_101_KABIN_LAND, SEED_37_RAI_LAND } from "@/lib/seed-listings";
import { matchesLandFilters } from "@/lib/land-search";
import { searchProperties } from "@/lib/property-search";
import { rankBuyerMatches } from "@/lib/buyer-matching";
import { getLandOverlayContext } from "@/lib/land-overlays";
import { ownerLeadSchema } from "@/lib/validations";

test("Kabin Buri reports green from Krai with no invented official facts", () => {
  const info = getZoning(SEED_101_KABIN_LAND);
  assert.deepEqual(info.zones, [{ color: "green", type_code: "", type_name: "" }]);
  assert.equal(info.status, "owner_reported");
  assert.match(info.source, /พี่ไกร/);
  for (const field of ["plan_name", "checked_at", "evidence_url"] as const) assert.equal(info[field], "");
  assert.ok(listingMetadataDescription(SEED_101_KABIN_LAND).includes(zoningSummary(SEED_101_KABIN_LAND)));
  assert.ok(listingMetadataDescription(SEED_101_KABIN_LAND).includes(ZONING_NOTICE));
});

test("partial multi-color data supersedes legacy color across filters, matching and overlays", () => {
  const land = { ...SEED_37_RAI_LAND, zoning_info: zoningSchema.parse({ zones: [{ color: "green" }, { color: "yellow", type_code: "ย.1" }, { color: null, type_name: "ยังไม่มีสี" }, { color: "green" }], status: "owner_reported" }) };
  assert.deepEqual(zoningColors(land), ["green", "yellow"]);
  assert.equal(matchesLandFilters(land, { zoning: "yellow" }), true);
  assert.equal(matchesLandFilters(land, { zoning: "purple" }), false);
  assert.equal(searchProperties([land], { zoning: "yellow" }).length, 1);
  assert.equal(searchProperties([land], { zoning: "purple" }).length, 0);
  assert.equal(rankBuyerMatches({ zoning: "yellow" }, [land])[0].score, 20);
  assert.deepEqual(getLandOverlayContext(land).zones.map(zone => zone.code), ["green", "yellow"]);
});

test("unknown, legacy and invalid structured data never fabricate evidence", () => {
  assert.equal(getZoning({ zoning: null }).status, "unknown");
  assert.equal(getZoning({ zoning: "purple" }).status, "owner_reported");
  assert.deepEqual(zoningColors({ zoning: "purple", zoning_info: zoningSchema.parse({}) }), []);
  const invalid = { zoning: "purple", zoning_info: { status: "document_verified" } } as unknown as typeof SEED_37_RAI_LAND;
  assert.equal(getZoning(invalid).status, "unknown");
  for (const input of [{ zones: [{ color: "invented" }] }, { checked_at: "2026-02-30" }, { checked_at: "yesterday" }, { evidence_url: "javascript:alert(1)" }, { status: "invented" }, { official: true }]) assert.equal(zoningSchema.safeParse(input).success, false);
});

test("map/document status requires source, valid check date and safe evidence link", () => {
  for (const status of ["map_checked", "document_verified"]) {
    assert.equal(zoningSchema.safeParse({ status }).success, false);
    assert.equal(zoningSchema.safeParse({ status, source: "หน่วยงานที่ตรวจ", checked_at: "2026-10-08", evidence_url: "https://example.com/evidence.pdf" }).success, true);
  }
});

test("owner submission preserves structured zoning and validates on server boundary", () => {
  const info = getZoning(SEED_101_KABIN_LAND);
  const form = new FormData(); form.set("zoning_info", JSON.stringify(info));
  const owner = { name: "เจ้าของ", phone: "0812345678", province: "ปราจีนบุรี", size_rai: 101.06, consent_pdpa: true, zoning_info: zoningFromForm(form) };
  assert.deepEqual(ownerLeadSchema.parse(owner).zoning_info, info);
  form.set("zoning_info", "broken");
  assert.equal(ownerLeadSchema.safeParse({ ...owner, zoning_info: zoningFromForm(form) }).success, false);
  assert.equal(ownerLeadSchema.safeParse({ ...owner, zoning_info: { status: "document_verified" } }).success, false);
  for (const status of ["map_checked", "document_verified"] as const) {
    const forged = { ...info, status, source: "claimed authority", checked_at: "2026-10-08", evidence_url: "https://example.com/proof.pdf" };
    assert.equal(zoningSchema.safeParse(forged).success, true);
    assert.equal(ownerLeadSchema.safeParse({ ...owner, zoning_info: forged }).success, false, "complete evidence cannot authorize a public caller");
    assert.equal(draftSchema.safeParse({ token: "00000000-0000-4000-8000-000000000001", zoning_info: forged }).success, false);
  }
  assert.equal(ownerLeadSchema.parse({ ...owner, verified_at: "2026-10-08", verified_by: "admin" }).zoning_info?.status, "owner_reported");
});

