import assert from "node:assert/strict";
import test from "node:test";
import { reconcileZoning } from "@/lib/seller-draft";
import { zoningSchema } from "@/lib/zoning";

test("legacy-only draft migrates color into zoning_info without claiming provenance", () => {
  const out = reconcileZoning({ zoning: "purple" as const, zoning_info: zoningSchema.parse({}) });
  assert.equal(out.zoning, "purple");
  assert.deepEqual(out.zoning_info.zones.map(zone => zone.color), ["purple"]);
  assert.equal(out.zoning_info.status, "unknown");
  assert.equal(reconcileZoning({ zoning: "purple" as const }).zoning_info.zones[0].color, "purple");
});

test("structured zoning_info is never discarded", () => {
  const zoning_info = zoningSchema.parse({ zones: [{ color: "brown" }], status: "owner_reported", plan_name: "ผังรวม" });
  const out = reconcileZoning({ zoning: "purple" as const, zoning_info });
  assert.deepEqual(out.zoning_info, zoning_info);
  assert.equal(out.zoning, "brown");
});

test("structured info without a color keeps its fields and gains the legacy color", () => {
  const out = reconcileZoning({ zoning: "purple" as const, zoning_info: zoningSchema.parse({ status: "owner_reported", plan_name: "x" }) });
  assert.equal(out.zoning_info.status, "owner_reported");
  assert.equal(out.zoning_info.plan_name, "x");
  assert.deepEqual(out.zoning_info.zones.map(zone => zone.color), ["purple"]);
});

test("empty draft stays empty", () => {
  const out = reconcileZoning({ zoning: null, zoning_info: zoningSchema.parse({}) });
  assert.equal(out.zoning, null);
  assert.deepEqual(out.zoning_info, zoningSchema.parse({}));
  assert.deepEqual(reconcileZoning({ zoning: null }).zoning_info, zoningSchema.parse({}));
});
