import assert from "node:assert/strict";
import test from "node:test";
import { rankBuyerMatches } from "@/lib/buyer-matching";
import { SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND, SEED_101_KABIN_LAND } from "@/lib/seed-listings";

test("direct listing interest ranks that property first", () => {
  const matches = rankBuyerMatches({ listing_id: SEED_37_RAI_LAND.slug }, SEED_ACTIVE_LISTINGS);
  assert.equal(matches[0]?.land.slug, SEED_37_RAI_LAND.slug);
  assert.ok(matches[0]?.score >= 100);
});

test("Rayong industrial buyer under 100m matches 37 rai ahead of Kabin Buri", () => {
  const matches = rankBuyerMatches({
    province: "ระยอง",
    land_type: "industrial",
    size_min_rai: 20,
    size_max_rai: 50,
    budget_max: 100_000_000,
  }, SEED_ACTIVE_LISTINGS);

  assert.equal(matches[0]?.land.slug, SEED_37_RAI_LAND.slug);
  assert.notEqual(matches[0]?.land.slug, SEED_101_KABIN_LAND.slug);
});

test("returns no arbitrary suggestions when buyer has no requirements", () => {
  assert.deepEqual(rankBuyerMatches({}, SEED_ACTIVE_LISTINGS), []);
});
