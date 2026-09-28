import test from "node:test";
import assert from "node:assert/strict";
import type { Land } from "@/lib/types/database";
import {
  mergeWithSeedListings,
  SEED_37_RAI_SLUG,
  SEED_101_KABIN_SLUG,
} from "./seed-listings.ts";

const slugs = (lands: Land[]) => lands.map((land) => land.slug);

// 1. Default /land (no filters) must include the canonical 37-rai seed
//    when the database returns zero active listings.
test("default /land includes the 37-rai seed when DB is empty", () => {
  const result = mergeWithSeedListings([]);
  assert.ok(
    slugs(result).includes(SEED_37_RAI_SLUG),
    "expected 37-rai seed in default results",
  );
});

// 2. "ระยอง" (rayong) province filter must include the 37-rai seed.
test("rayong province filter includes the 37-rai seed", () => {
  const result = mergeWithSeedListings([], { province_slug: "rayong" });
  assert.ok(slugs(result).includes(SEED_37_RAI_SLUG));
});

// 2b. EEC / industrial type filters must include the 37-rai seed.
test("eec and industrial type filters include the 37-rai seed", () => {
  assert.ok(
    slugs(mergeWithSeedListings([], { land_type: "eec" })).includes(
      SEED_37_RAI_SLUG,
    ),
  );
  assert.ok(
    slugs(mergeWithSeedListings([], { land_type: "industrial" })).includes(
      SEED_37_RAI_SLUG,
    ),
  );
});

// 3. An intentionally non-matching filter must return empty results.
test("non-matching province filter returns empty results", () => {
  const result = mergeWithSeedListings([], { province_slug: "chiang-mai" });
  assert.equal(result.length, 0);
});

// 5. Active 101-rai Kabin Buri must appear in default /land results.
test("default /land includes the 101-rai Kabin Buri seed when DB is empty", () => {
  assert.ok(slugs(mergeWithSeedListings([])).includes(SEED_101_KABIN_SLUG));
});

// Real DB rows must be preserved alongside the seed fallback (single pipeline).
test("real DB listings are preserved alongside the seed fallback", () => {
  const dbRow = { slug: "db-only-listing", status: "active" } as unknown as Land;
  const result = mergeWithSeedListings([dbRow]);
  assert.ok(slugs(result).includes("db-only-listing"));
  assert.ok(slugs(result).includes(SEED_37_RAI_SLUG));
});
