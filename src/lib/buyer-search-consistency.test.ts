import test from "node:test";
import assert from "node:assert/strict";
import { PROPERTY_TYPES } from "./marketplace/presentation.ts";
import { buyerRequirementSchema } from "./marketplace/schemas.ts";
import { buyerLeadSchema } from "./validations.ts";
import { classifyBuyerMatch } from "./marketplace/matching.ts";
import { parsePropertySearchParams, propertyMatchesSearchFilters, propertySearchSqlClauses } from "./marketplace/search-filters.ts";
import { propertySqlOrder, sortPropertyResults } from "./marketplace/search-sort.ts";
import { searchProperties } from "./property-search.ts";
import { matchesLandFilters } from "./land-search.ts";
import { rankBuyerMatches, rankPropertyBuyers } from "./buyer-matching.ts";
import { SEED_PUBLIC_LISTINGS } from "./seed-listings.ts";

const contact = { name: "Buyer", phone: "0812345678", consent_pdpa: true };
const building = { ...SEED_PUBLIC_LISTINGS[0], id: "building", property_type: "condo" as const, land_type: "condo" as const, size_rai: null, price_per_rai: null, usable_area_sqm: 80 };
const criteria = { transaction_type: "sale" as const, province_ids: [], preferred_locations: [] };

test("all 15 types survive buyer and lead validation, search, and both matching directions", () => {
  assert.equal(PROPERTY_TYPES.length, 15);
  for (const type of PROPERTY_TYPES) {
    const property = { ...building, property_type: type, land_type: type };
    assert.equal(buyerRequirementSchema.parse({ ...contact, property_type: type }).property_type, type);
    assert.equal(buyerLeadSchema.parse({ ...contact, property_type: type }).property_type, type);
    const filters = parsePropertySearchParams(new URLSearchParams({ property_type: type }));
    assert.equal(filters.property_type, type);
    assert.equal(propertyMatchesSearchFilters(property, filters), true);
    assert.equal(classifyBuyerMatch(property, { ...criteria, property_type: type }), "full");
    assert.equal(rankBuyerMatches({ property_type: type }, [property])[0]?.score, 25);
    assert.equal(rankPropertyBuyers(property, [{ id: "buyer", lead_type: "buyer", status: "new", details: { property_type: type } }])[0]?.score, 25);
  }
  for (const type of ["industrial", "new_type", "__proto__"]) {
    assert.equal(buyerLeadSchema.safeParse({ ...contact, property_type: type }).success, false);
    assert.equal(buyerRequirementSchema.safeParse({ ...contact, property_type: type }).success, false);
  }
});

test("usable-area bounds are optional, numeric, precise, and ordered independently of rai", () => {
  const input = buyerRequirementSchema.parse({ ...contact, min_size_rai: 1, max_size_rai: 2, min_usable_area_sqm: 80.25, max_usable_area_sqm: 120 });
  assert.equal(input.min_size_rai, 1);
  assert.equal(input.min_usable_area_sqm, 80.25);
  assert.equal(buyerRequirementSchema.parse(contact).min_usable_area_sqm, undefined);
  assert.equal(buyerRequirementSchema.parse({ ...contact, min_usable_area_sqm: null }).min_usable_area_sqm, null);
  for (const field of ["min_usable_area_sqm", "max_usable_area_sqm"]) {
    for (const value of [-1, NaN, Infinity, "80", true, 0.001, 10_000_000_000]) {
      assert.equal(buyerRequirementSchema.safeParse({ ...contact, [field]: value }).success, false);
      assert.equal(buyerLeadSchema.safeParse({ ...contact, [field]: value }).success, false);
    }
    assert.equal(buyerRequirementSchema.safeParse({ ...contact, [field]: 0 }).success, true);
  }
  for (const schema of [buyerRequirementSchema, buyerLeadSchema]) {
    const result = schema.safeParse({ ...contact, min_usable_area_sqm: 81, max_usable_area_sqm: 80 });
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["max_usable_area_sqm"]);
  }
});

test("sqm-only properties skip irrelevant rai bounds but must satisfy explicit sqm bounds", () => {
  const filters = { min_size_rai: 10, max_size_rai: 20, min_price_per_rai: 1, max_price_per_rai: 2, min_usable_area_sqm: 80, max_usable_area_sqm: 80 };
  for (const size_rai of [null, 0]) {
    const property = { ...building, size_rai };
    assert.equal(propertyMatchesSearchFilters(property, filters), true);
    assert.equal(classifyBuyerMatch(property, { ...criteria, ...filters }), "full");
    assert.equal(classifyBuyerMatch(property, { ...criteria, ...filters, min_usable_area_sqm: 81 }), "near");
    assert.equal(propertyMatchesSearchFilters(property, { ...filters, max_usable_area_sqm: 79 }), false);
    assert.equal(searchProperties([property], { min_size: "10", max_size: "20", min_price: "1", max_price: "2", min_usable_area_sqm: "80" }).length, 1);
    assert.equal(matchesLandFilters(property, { size_min: 10, size_max: 20, price_min: 1, price_max: 2 }), true);
  }
  const missing = { ...building, usable_area_sqm: null };
  assert.equal(propertyMatchesSearchFilters(missing, { min_size_rai: 10 }), false);
  assert.equal(propertyMatchesSearchFilters(missing, { min_usable_area_sqm: 0 }), false);
  assert.equal(classifyBuyerMatch(missing, { ...criteria, min_usable_area_sqm: 80 }), "near");
  const land = { ...building, size_rai: 15, usable_area_sqm: null, price_per_rai: 2 };
  assert.equal(propertyMatchesSearchFilters(land, { min_size_rai: 10, max_size_rai: 20 }), true);
  assert.equal(propertyMatchesSearchFilters(land, { max_size_rai: 14 }), false);
  assert.equal(propertyMatchesSearchFilters(land, { min_price_per_rai: 3 }), false);
  assert.equal(propertyMatchesSearchFilters({ ...land, usable_area_sqm: 80 }, filters), true);
});

test("SQL filters and size sort keep units separate and rank missing sizes last", () => {
  const params = new URLSearchParams({ property_type: "condo", min_size_rai: "10", max_size_rai: "20", min_usable_area_sqm: "80", max_usable_area_sqm: "120", min_price_per_rai: "1" });
  const filters = parsePropertySearchParams(params);
  assert.equal(filters.min_usable_area_sqm, 80);
  const values: unknown[] = [];
  const sql = propertySearchSqlClauses(filters, (value) => { values.push(value); return `$${values.length}`; }, []).join(" and ");
  assert.match(sql, /coalesce\(l.size_rai, 0\) <= 0/);
  assert.match(sql, /usable_area_sqm/);
  assert.match(sql, /else 'other'/);
  assert.ok(values.includes(80) && values.includes(120));
  const rows = [
    { ...building, id: "missing", usable_area_sqm: null },
    building,
    { ...building, id: "large-building", size_rai: 0, usable_area_sqm: 120 },
    { ...building, id: "land", size_rai: 1, usable_area_sqm: null },
    { ...building, id: "large-land", size_rai: 2, usable_area_sqm: 20 },
  ];
  assert.deepEqual(sortPropertyResults(rows, "size_desc").map((row) => row.id), ["large-land", "land", "large-building", "building", "missing"]);
  assert.deepEqual(searchProperties(rows, { sort: "size_desc" }).map((row) => row.id), ["large-land", "land", "large-building", "building", "missing"]);
  assert.equal(rows[0].id, "missing", "sorting must not mutate the input");
  assert.match(propertySqlOrder("size_desc"), /l\.size_rai > 0[\s\S]*usable_area_sqm/);
  assert.doesNotMatch(sql + propertySqlOrder("size_desc"), /1600|400/);
});


test("SEO category filters survive query parsing and match both SQL and inventory predicates", () => {
  for (const type of ["land", "industrial", "eec", "factory", "warehouse", "logistics", "data_center", "investment"] as const) {
    const filters = parsePropertySearchParams(new URLSearchParams({ type: type.replaceAll("_", "-"), status: "active" }));
    assert.equal(filters.type, type);
    const property = { ...building, land_type: type, is_eec: false };
    assert.equal(propertyMatchesSearchFilters(property, filters), true);
    assert.equal(propertyMatchesSearchFilters({ ...property, land_type: "other" }, filters), false);
    const values: unknown[] = [];
    const sql = propertySearchSqlClauses(filters, value => { values.push(value); return "$" + values.length; }, []).join(" and ");
    assert.ok(values.includes(type));
    assert.match(sql, /l\.land_type::text = \$\d+/);
    if (type === "eec") {
      assert.match(sql, /or l\.is_eec = true/);
      assert.equal(propertyMatchesSearchFilters({ ...property, land_type: "industrial", is_eec: true }, filters), true);
    }
  }
  assert.equal(parsePropertySearchParams(new URLSearchParams({ type: "__proto__" })).type, undefined);
});
