import test from "node:test";
import assert from "node:assert/strict";
import { applyLandFilters, landSearchParams, landTextFilter, matchesLandFilters, parseLandPage, parseLandSearchParams } from "./land-search.ts";
import { SEED_37_RAI_LAND, SEED_101_KABIN_LAND } from "./seed-listings.ts";
import { searchProperties } from "./property-search.ts";

test("URL filters roundtrip with Thai text, zero bounds, false EEC and page", () => {
  const input = { province: "rayong", type: "data-center", q: " ที่ดิน ", min_size: "0", max_size: "50.5", min_price: "0", max_price: "2300000", zoning: "purple", eec: "false" };
  const filters = parseLandSearchParams(input);
  assert.equal(filters.q, "ที่ดิน");
  assert.equal(filters.land_type, "data_center");
  assert.equal(filters.is_eec, false);
  const params = landSearchParams(filters, 3);
  assert.equal(params.get("page"), "3");
  assert.deepEqual(parseLandSearchParams(Object.fromEntries(params)), filters);
});

test("malformed URLs fail rather than broadening results", () => {
  for (const input of [
    { type: "invalid" }, { type: "toString" }, { zoning: "toString" }, { eec: "1" },
    { min_size: "-1" }, { min_size: "Infinity" }, { max_price: "1e999" }, { max_size: "NaN" },
    { min_size: "2", max_size: "1" }, { min_price: "3", max_price: "2" },
    { province: "rayong),status.eq.draft" }, { q: "x".repeat(201) }, { zoning: ["purple", "green"] },
  ]) assert.throws(() => parseLandSearchParams(input));
  for (const page of ["0", "-1", "NaN", "Infinity", "1.5", "100001", ["1", "2"]]) assert.equal(parseLandPage(page), 1);
  assert.equal(parseLandPage("2"), 2);
});

test("curated fallback uses every server criterion with inclusive decimal bounds", () => {
  const matching = parseLandSearchParams({ province: "rayong", type: "industrial", q: "EEC", min_size: "37", max_size: "37", min_price: "2300000", max_price: "2300000", zoning: "purple", eec: "true" });
  assert.ok(matchesLandFilters(SEED_37_RAI_LAND, matching));
  assert.equal(matchesLandFilters(SEED_101_KABIN_LAND, matching), false);
  for (const input of [{ max_size: "36.99" }, { min_price: "2300000.01" }, { eec: "false" }, { zoning: "green" }, { q: "%" }]) {
    assert.equal(matchesLandFilters(SEED_37_RAI_LAND, parseLandSearchParams(input)), false);
  }
  assert.ok(matchesLandFilters(SEED_37_RAI_LAND, { land_type: "eec" }));
});

test("advanced listing filters preserve active-only inventory before pagination", () => {
  const filters = parseLandSearchParams({ province: "rayong", type: "eec", q: "EEC", min_size: "37", max_size: "37", min_price: "2300000", max_price: "2300000", zoning: "purple", eec: "true" });
  const rows = ["reserved", "sold", "draft", "archived", "active"].map(status => ({
    ...SEED_37_RAI_LAND, id: status, status: status as typeof SEED_37_RAI_LAND.status,
  }));
  const deleted = { ...SEED_37_RAI_LAND, id: "deleted", deleted_at: "2026-09-30" };
  const results = searchProperties([...rows, deleted, SEED_101_KABIN_LAND])
    .filter(land => matchesLandFilters(land, filters));
  assert.deepEqual(results.slice(0, 1).map(land => land.id), ["active"]);
  assert.equal(results.length, 1);
});

test("all URL criteria become database filters before pagination", () => {
  const calls: unknown[][] = [];
  const query = {
    eq: (column: string, value: string | boolean) => { calls.push(["eq", column, value]); return query; },
    gte: (column: string, value: number) => { calls.push(["gte", column, value]); return query; },
    lte: (column: string, value: number) => { calls.push(["lte", column, value]); return query; },
    or: (value: string) => { calls.push(["or", value]); return query; },
  };
  applyLandFilters(query, parseLandSearchParams({ province: "rayong", type: "eec", q: "factory", min_size: "0", max_size: "37", min_price: "0", max_price: "2300000", zoning: "purple", eec: "false" }));
  assert.deepEqual(calls, [
    ["eq", "province.slug", "rayong"], ["or", "land_type.eq.eec,is_eec.eq.true"],
    ["or", 'title_th.imatch."factory",district.imatch."factory",description.imatch."factory"'],
    ["gte", "size_rai", 0], ["lte", "size_rai", 37],
    ["gte", "price_per_rai", 0], ["lte", "price_per_rai", 2300000],
    ["eq", "zoning", "purple"], ["eq", "is_eec", false],
  ]);
});

test("small native numeric inputs survive saved URLs and pagination", () => {
  const filters = parseLandSearchParams({ min_size: "0.0000001" });
  assert.deepEqual(parseLandSearchParams(Object.fromEntries(landSearchParams(filters))), filters);
});

test("PostgREST text values quote injection syntax and escape regex metacharacters", () => {
  const text = 'x%_*\\"),status.eq.draft';
  const filter = landTextFilter(text);
  const clauses = filter.match(/(?:title_th|district|description)\.imatch\."((?:\\.|[^"\\])*)"/g)!;
  assert.equal(clauses.length, 3);
  for (const clause of clauses) {
    const encoded = clause.slice(clause.indexOf('.imatch."') + 9, -1);
    const pattern = encoded.replace(/\\([\\"])/g, "$1");
    const matcher = new RegExp(pattern, "i");
    assert.ok(matcher.test(`before ${text} after`));
    assert.equal(matcher.test("anything status=active"), false);
  }
});
