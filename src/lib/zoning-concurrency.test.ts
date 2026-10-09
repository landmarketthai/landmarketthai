import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// queries.ts imports next/cache, so assert on source. Row-level proof: scripts/zoning-uat.mjs-style psql check.
const queries = readFileSync("src/lib/neon/queries.ts", "utf8");
const mutations = readFileSync("src/lib/neon/mutations.ts", "utf8");

test("zoning editor token keeps microseconds that the driver would truncate to ms", () => {
  const fn = queries.slice(queries.indexOf("export async function getZoningManagementListings"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(queries, /as updated_at_token/);
  assert.match(queries, /HH24:MI:SS\.US/);
  assert.match(body, /ZONING_LISTINGS_SELECT/);
  assert.match(body, /normalizeZoningLand/);
  assert.match(queries, /\{ \.\.\.land, updated_at: token \}/);
});

test("updateLandZoning compares updated_at exactly against the token", () => {
  assert.match(mutations, /updated_at = \$2::timestamptz/);
});
