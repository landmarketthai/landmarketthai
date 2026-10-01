import test from "node:test";
import assert from "node:assert/strict";
import { getPublicInventory } from "./public-inventory.ts";
import { SEED_PUBLIC_LISTINGS, SEED_37_RAI_LAND } from "./seed-listings.ts";
import { searchProperties } from "./property-search.ts";
import { matchesLandFilters, parseLandSearchParams } from "./land-search.ts";

test("Neon inventory loads every page and never merges seeds into configured inventory", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ ...SEED_37_RAI_LAND, id: String(index), slug: String(index) }));
  const offsets: number[] = [];
  const loaded = await getPublicInventory(async ({ limit, offset }) => {
    assert.equal(limit, 100);
    offsets.push(offset);
    return rows.slice(offset, offset + limit);
  }, true);
  assert.deepEqual(loaded, rows);
  assert.equal(new Set(loaded.map(row => row.id)).size, 1001);
  assert.deepEqual(offsets, Array.from({ length: 11 }, (_, index) => index * 100));
  assert.deepEqual(await getPublicInventory(async () => [], true), []);
  await assert.rejects(getPublicInventory(async ({ offset }) => {
    if (offset) throw new Error("later page failed");
    return rows.slice(0, 100);
  }, true), /later page failed/);
  assert.deepEqual(await getPublicInventory(async () => { throw new Error("must not query"); }, false), SEED_PUBLIC_LISTINGS);
});

test("public history preserves sold 109 rai and active search preserves exact areas and coordinates", async () => {
  const inventory = await getPublicInventory(undefined, false);
  assert.deepEqual(searchProperties(inventory).map(land => land.size_rai).sort((a, b) => a - b), [36.91825, 101.06]);
  assert.equal(searchProperties(inventory, { history: "1" })[0].slug, "109-rai-eec-rayong");
  assert.equal(searchProperties(inventory, { history: "1" })[0].size_rai, 109.63);
  const filters = parseLandSearchParams({ min_size: "36.91825", max_size: "36.91825", zoning: "purple", eec: "true" });
  assert.deepEqual(searchProperties(inventory).filter(land => matchesLandFilters(land, filters)).map(land => land.slug), [SEED_37_RAI_LAND.slug]);
});
