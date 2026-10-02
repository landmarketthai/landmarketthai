import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("legacy province category pages filter by their category and keep all eight SEO categories", () => {
  const grid = read("../src/components/listings/ListingGrid.tsx");
  const utils = read("../src/lib/utils.ts");
  assert.match(grid, /land\.land_type === type/);
  assert.match(utils, /LAND_CATEGORY_TYPES = \["land", "industrial", "eec", "factory", "warehouse", "logistics", "data_center", "investment"\]/);
});

test("legacy detail presents usable area and canonical listing href without land-only pricing for buildings", () => {
  const detail = read("../src/app/listing/[slug]/page.tsx");
  assert.match(detail, /propertySizeLabel\(land\)/);
  assert.match(detail, /land\.price_per_rai != null && land\.size_rai != null/);
  assert.match(detail, /canonical: listingHref\(land\.public_ref, land\.slug\)/);
});

test("removed land insights URL redirects permanently to search", () => {
  assert.match(read("../next.config.ts"), /source: "\/land-insights", destination: "\/search", permanent: true/);
  assert.doesNotMatch(read("../middleware.ts"), /land-insights/);
});

test("property type migration preserves buyer demand legacy values and all canonical types", () => {
  const migration = read("../db/migrations/20261002_property_types_usable_area.sql");
  const buyerDemandCheck = migration.match(/alter table buyer_demand add constraint buyer_demand_land_type_check[\s\S]*?validate constraint buyer_demand_land_type_check;/i)?.[0];
  assert.ok(buyerDemandCheck, "buyer demand check remains NOT VALID then VALIDATEd");
  for (const value of ["industrial", "eec", "logistics", "data_center", "investment"]) {
    assert.match(buyerDemandCheck, new RegExp(`'${value}'`));
  }
  for (const value of ["land", "house", "house_with_land", "townhouse", "condo", "housing_project", "commercial_building", "office", "factory", "warehouse", "apartment", "hotel_resort", "retail", "business_property", "other"]) {
    assert.match(buyerDemandCheck, new RegExp(`'${value}'`));
  }
});
