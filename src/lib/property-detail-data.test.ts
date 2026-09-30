import test from "node:test";
import assert from "node:assert/strict";
import { propertyDetails } from "./property-detail-data.ts";
import { SEED_ACTIVE_LISTINGS } from "./seed-listings.ts";

test("static property routes use canonical listings and matching map coordinates", () => {
  for (const property of propertyDetails) {
    const land = SEED_ACTIVE_LISTINGS.find((listing) => listing.slug === property.slug);
    assert.ok(land, `missing canonical listing for ${property.slug}`);
    assert.ok(property.mapEmbed, `missing map for ${property.slug}`);
    const coords = new URL(property.mapEmbed.embedUrl).searchParams.get("q")?.split(",").map(Number);
    assert.deepEqual(coords, [land.lat, land.lng], property.slug);
    assert.ok(!property.facts.some((fact) => fact.label === "สถานะ"), "status must come from the canonical listing");
  }
});
