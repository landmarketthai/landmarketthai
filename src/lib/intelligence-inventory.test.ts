import test from "node:test";
import assert from "node:assert/strict";
import { loadIntelligenceInventory } from "./intelligence-inventory.ts";
import { SEED_PUBLIC_LISTINGS, SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND } from "./seed-listings.ts";

test("intelligence uses active current inventory, respects empty inventory and propagates failures", async () => {
  const inventory = await loadIntelligenceInventory(async () => [
    ...SEED_PUBLIC_LISTINGS,
    { ...SEED_37_RAI_LAND, status: "reserved" },
    { ...SEED_37_RAI_LAND, status: "draft" },
    { ...SEED_37_RAI_LAND, deleted_at: "2026-09-30" },
  ]);
  assert.deepEqual(inventory.lands, SEED_ACTIVE_LISTINGS);
  assert.deepEqual((await loadIntelligenceInventory(async () => [])).lands, []);
  await assert.rejects(loadIntelligenceInventory(async () => { throw new Error("database unavailable"); }), /database unavailable/);
});
