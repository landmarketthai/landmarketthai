import assert from "node:assert/strict";
import test from "node:test";
import { findInventoryComparables, getInventoryAnalytics, INVENTORY_SCOPE } from "@/lib/inventory-analytics";
import { SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND, SEED_101_KABIN_LAND } from "@/lib/seed-listings";
import type { Land } from "@/lib/types/database";

function listing(id: string, overrides: Partial<Land> = {}): Land {
  return { ...SEED_37_RAI_LAND, id, slug: id, ...overrides };
}

test("seed inventory has accurate asking-price statistics and explicit scope", () => {
  const result = getInventoryAnalytics(SEED_ACTIVE_LISTINGS);
  assert.equal(result.scope, INVENTORY_SCOPE);
  assert.match(result.priceBasis, /asking prices.*not sale prices.*valuations/);
  assert.equal(result.currency, "THB");
  assert.equal(result.listingCount, 2);
  assert.deepEqual(result.pricePerRai, {
    count: 2, min: 1_500_000, max: 2_300_000, median: 1_900_000, average: 1_900_000,
  });
  assert.deepEqual(result.totalPrice, {
    count: 2, min: 85_100_000, max: 151_590_000, median: 118_345_000, average: 118_345_000,
  });
  assert.equal(result.byProvince.length, 2);
  assert.equal(result.byProvince.find((group) => group.key === SEED_37_RAI_LAND.province_id)?.pricePerRai.median, 2_300_000);
  assert.equal(result.byLandType[0].key, "industrial");
  assert.equal(result.byLandType[0].listingCount, 2);
  assert.equal(result.byZoning.find((group) => group.key === "unknown")?.listingCount, 1);
});

test("inactive/deleted listings are excluded and invalid prices never become observations", () => {
  const lands: Land[] = [
    listing("valid", { price_per_rai: 4, total_price: 40 }),
    listing("zero", { price_per_rai: 0, total_price: 0 }),
    listing("negative", { price_per_rai: -2, total_price: -20 }),
    listing("infinite", { price_per_rai: Infinity, total_price: Infinity }),
    listing("nan", { price_per_rai: NaN, total_price: null }),
    listing("deleted", { deleted_at: "2026-09-01" }),
    ...(["draft", "reserved", "sold", "archived"] as const).map((status) => listing(status, { status })),
  ];
  const result = getInventoryAnalytics(lands);
  assert.equal(result.listingCount, 5);
  assert.deepEqual(result.pricePerRai, { count: 1, min: 4, max: 4, median: 4, average: 4 });
  assert.deepEqual(result.totalPrice, { count: 1, min: 40, max: 40, median: 40, average: 40 });
});

test("empty samples remain null and missing metadata stays unknown", () => {
  const empty = getInventoryAnalytics([]);
  assert.deepEqual(empty.pricePerRai, { count: 0, min: null, max: null, median: null, average: null });
  assert.equal(empty.listingCount, 0);
  assert.deepEqual(empty.byProvince, []);
  const unknown = getInventoryAnalytics([listing("missing", {
    province_id: "", province: undefined, zoning: null, price_per_rai: NaN, total_price: null,
  })]);
  assert.equal(unknown.byProvince[0].key, "unknown");
  assert.equal(unknown.byZoning[0].label, "Unknown zoning");
  assert.equal(unknown.totalPrice.count, 0);
});

test("median uses the middle observed price and analytics do not mutate input", () => {
  const lands = [9, 1, 3].map((price, index) => listing(`listing-${index}`, { price_per_rai: price }));
  const before = [...lands];
  const result = getInventoryAnalytics(lands);
  assert.equal(result.pricePerRai.median, 3);
  assert.equal(result.pricePerRai.average, 13 / 3);
  assert.deepEqual(lands, before);
});

test("comparables require active priced listings in the same known province/type and exclude the subject", () => {
  const subject = listing("subject");
  const inventory = [
    subject,
    listing("duplicate-slug", { slug: subject.slug }),
    listing("same"),
    listing("deleted", { deleted_at: "2026-09-01" }),
    listing("sold", { status: "sold" }),
    listing("unpriced", { price_per_rai: 0 }),
    listing("wrong-type", { land_type: "warehouse" }),
    SEED_101_KABIN_LAND,
  ];
  const result = findInventoryComparables(subject, inventory);
  assert.deepEqual(result.comparables.map((item) => item.land.id), ["same"]);
  assert.equal(result.scope, INVENTORY_SCOPE);
  assert.equal(result.listingCount, 1);
  assert.equal(result.pricePerRai.count, 1);
  assert.equal(result.comparables[0].distanceKm, 0);
  assert.equal(result.comparables[0].sizeDifferenceRatio, 0);
  assert.equal(findInventoryComparables(subject, inventory, 0).listingCount, 0);
  assert.equal(findInventoryComparables(subject, inventory, NaN).listingCount, 0);
  const unknown = listing("unknown-subject", { province_id: "", province: undefined });
  assert.deepEqual(findInventoryComparables(unknown, [listing("unknown-candidate", { province_id: "", province: undefined })]).comparables, []);
});

test("comparable ranking is deterministic by known zoning, size, proximity and ID", () => {
  const subject = listing("subject", { size_rai: 40, lat: 13, lng: 101 });
  const candidates = [
    listing("unknown-zoning", { zoning: null, size_rai: 40, lat: 13, lng: 101 }),
    listing("far", { size_rai: 42, lat: 14, lng: 101 }),
    listing("near-b", { size_rai: 42, lat: 13.1, lng: 101 }),
    listing("near-a", { size_rai: 42, lat: 13.1, lng: 101 }),
    listing("bigger", { size_rai: 80, lat: 13, lng: 101 }),
  ];
  const result = findInventoryComparables(subject, candidates);
  assert.deepEqual(result.comparables.map((item) => item.land.id), ["near-a", "near-b", "far", "bigger", "unknown-zoning"]);
  assert.deepEqual(findInventoryComparables(subject, [...candidates].reverse()), result);
  assert.ok(result.comparables[0].distanceKm! > 10 && result.comparables[0].distanceKm! < 12);
  assert.equal(result.comparables[0].sizeDifferenceRatio, 0.05);
  assert.equal(result.comparables.at(-1)?.reasons.includes("Same reported zoning"), false);
  const nullZoning = findInventoryComparables(listing("subject", { zoning: null }), [listing("candidate", { zoning: null })]);
  assert.equal(nullZoning.comparables[0].reasons.includes("Same reported zoning"), false);
});

test("missing or invalid comparable sizes and coordinates remain null, never inferred", () => {
  const subject = listing("subject", { size_rai: NaN, lat: null, lng: null });
  const result = findInventoryComparables(subject, [listing("candidate", { size_rai: 0, lat: 100, lng: 101 })]);
  assert.equal(result.comparables[0].sizeDifferenceRatio, null);
  assert.equal(result.comparables[0].distanceKm, null);
});
