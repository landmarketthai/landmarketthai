import test from "node:test";
import assert from "node:assert/strict";
import { SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND, SEED_101_KABIN_LAND, mergeWithSeedListings } from "./seed-listings.ts";
import { searchProperties, hasCoordinates, listingUpdatedLabel, LISTING_STATUS_LABELS } from "./property-search.ts";
import type { Land } from "@/lib/types/database";

test("active search excludes reserved, sold, draft, archived and deleted inventory; history is sold-only", () => {
  const statuses = ["active", "reserved", "sold", "draft", "archived"] as const;
  const rows = statuses.map((status) => ({ ...SEED_37_RAI_LAND, id: status, slug: status, status }));
  rows.push({ ...SEED_37_RAI_LAND, id: "deleted", slug: "deleted", status: "active", deleted_at: "2026-09-30" } as typeof rows[number]);
  assert.deepEqual(searchProperties(rows).map((land) => land.id), ["active"]);
  assert.deepEqual(searchProperties(rows, { history: "1" }).map((land) => land.id), ["sold"]);
  assert.deepEqual(searchProperties(rows, { transaction_type: "rent" }), []);
});

test("database sold/deleted seed rows are never resurrected as active seeds", () => {
  for (const change of [{ status: "sold" }, { status: "draft" }, { deleted_at: "2026-09-30" }]) {
    const row = { ...SEED_37_RAI_LAND, ...change } as Land;
    assert.ok(!searchProperties(mergeWithSeedListings([row])).some((land) => land.slug === row.slug));
  }
});

test("search combines Thai/English location terms, EEC, price and size boundaries", () => {
  assert.deepEqual(searchProperties(SEED_ACTIVE_LISTINGS, { q: "rayong  EEC", type: "eec", min_price: "2300000", max_price: "2300000", min_size: "36.91825", max_size: "36.91825" }).map((land) => land.slug), [SEED_37_RAI_LAND.slug]);
  assert.deepEqual(searchProperties(SEED_ACTIVE_LISTINGS, { q: "หนองกี่", province: "prachin-buri", property_type: "land" }).map((land) => land.slug), [SEED_101_KABIN_LAND.slug]);
  assert.deepEqual(searchProperties(SEED_ACTIVE_LISTINGS, { province: "rayong", min_size: "100" }), []);
  assert.deepEqual(searchProperties(SEED_ACTIVE_LISTINGS, { property_type: "warehouse" }), []);
  assert.deepEqual(searchProperties(SEED_ACTIVE_LISTINGS, { min_price: "3000000", max_price: "1000000" }), []);
});

test("result ordering and map points use the same filtered inventory without dropping unmapped cards", () => {
  const noCoords = { ...SEED_37_RAI_LAND, id: "no-coords", lat: null, lng: null, price_per_rai: 1_000_000 };
  const rows = searchProperties([...SEED_ACTIVE_LISTINGS, noCoords], { sort: "price_asc" });
  assert.deepEqual(rows.map((land) => land.id), [noCoords.id, SEED_101_KABIN_LAND.id, SEED_37_RAI_LAND.id]);
  assert.deepEqual(rows.filter(hasCoordinates).map((land) => land.id), [SEED_101_KABIN_LAND.id, SEED_37_RAI_LAND.id]);
  assert.equal(searchProperties(SEED_ACTIVE_LISTINGS, { sort: "size_desc" })[0].id, SEED_101_KABIN_LAND.id);
});

test("map accepts zero coordinates but rejects incomplete, out-of-range and non-finite points", () => {
  assert.equal(hasCoordinates({ lat: 0, lng: 0 }), true);
  for (const point of [{ lat: null, lng: 0 }, { lat: 0, lng: null }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }]) {
    assert.equal(hasCoordinates(point), false);
  }
  assert.deepEqual(SEED_ACTIVE_LISTINGS.map((land) => [land.lat, land.lng]), [[12.8626284, 101.0948946], [14.0417619, 101.8310660]]);
});

test("trust dates use Bangkok time and preserve distinct public statuses", () => {
  assert.equal(listingUpdatedLabel("2026-09-29T18:00:00Z"), listingUpdatedLabel("2026-09-30T01:00:00+07:00"));
  assert.equal(listingUpdatedLabel("bad-date"), "ไม่ระบุวันที่");
  assert.equal(LISTING_STATUS_LABELS.expired, "หมดอายุ");
  assert.equal(new Set([LISTING_STATUS_LABELS.active, LISTING_STATUS_LABELS.reserved, LISTING_STATUS_LABELS.sold]).size, 3);
});
