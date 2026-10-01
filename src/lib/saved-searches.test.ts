import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSameOriginMutation, parseSavedSearch, savedSearchUpdateSchema, readSavedSearches, writeSavedSearches, saveBrowserSearch } from "@/lib/saved-searches";
import { parseLandSearchParams } from "@/lib/land-search";

test("saved searches preserve all filters and canonicalize equivalent URLs", () => {
  const input = { name: "  Factory search  ", search_params: "eec=false&max_price=05000000&min_size=10.50&zoning=purple&type=factory&province=chonburi&q=road", alert_requested: true };
  const saved = parseSavedSearch(input);
  assert.equal(saved.name, "Factory search");
  assert.equal(saved.alert_requested, true);
  assert.deepEqual(parseLandSearchParams(Object.fromEntries(new URLSearchParams(saved.search_params))), {
    province_slug: "chonburi", land_type: "factory", q: "road", size_min: 10.5,
    price_max: 5000000, zoning: "purple", is_eec: false,
  });
  assert.equal(saved.search_params, parseSavedSearch({ ...input, search_params: "province=chonburi&type=factory&q=road&min_size=10.5&max_price=5000000&zoning=purple&eec=false" }).search_params);
  const unicodeQuery = new URLSearchParams({ q: "ก".repeat(200), province: "chonburi", min_size: "10", max_size: "100", min_price: "100000", max_price: "5000000", zoning: "purple", eec: "true" }).toString();
  assert.equal(parseSavedSearch({ ...input, search_params: unicodeQuery }).search_params.includes("q="), true);
});

test("invalid filters and ownership or delivery claims are rejected at the write boundary", () => {
  const input = { name: "Search", search_params: "", alert_requested: false };
  for (const search_params of ["min_size=20&max_size=10", "min_price=-1", "eec=1", "zoning=invalid", "q=a&q=b", "redirect=https://evil.test", "page=2"]) {
    assert.throws(() => parseSavedSearch({ ...input, search_params }));
  }
  assert.throws(() => parseSavedSearch({ ...input, user_id: "someone-else" }));
  assert.throws(() => parseSavedSearch({ ...input, delivered: true }));
  assert.throws(() => parseSavedSearch({ ...input, name: " " }));
  assert.throws(() => parseSavedSearch({ ...input, alert_requested: "true" }));
  assert.equal(savedSearchUpdateSchema.safeParse({ id: "not-a-uuid", alert_requested: false }).success, false);
});

test("saved search mutations check browser origin against the public proxy host", () => {
  const check = (headers: Record<string, string>) => isSameOriginMutation(new Headers(headers), "http://localhost:3000");
  assert.ok(check({ origin: "https://landmarketthai.com", "x-forwarded-host": "landmarketthai.com", host: "localhost:3000" }));
  assert.ok(check({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }));
  assert.equal(check({ origin: "https://evil.test", host: "landmarketthai.com" }), false);
  assert.equal(check({ origin: "null" }), false);
  assert.equal(check({ "sec-fetch-site": "cross-site" }), false);
});

test("browser searches round trip, deduplicate canonical filters and preserve existing data on failure", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const input = { name: "Rayong", search_params: "province=rayong&min_size=36.91825", alert_requested: false };
  saveBrowserSearch(input, storage);
  const first = readSavedSearches(storage)[0];
  saveBrowserSearch({ ...input, name: "Updated", search_params: "min_size=36.91825&province=rayong", alert_requested: true }, storage);
  const items = readSavedSearches(storage);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, first.id);
  assert.equal(items[0].name, "Updated");
  assert.equal(items[0].alert_requested, true);
  const before = [...data];
  assert.throws(() => saveBrowserSearch({ ...input, search_params: "redirect=https://evil.test" }, storage));
  assert.deepEqual([...data], before);
  writeSavedSearches([], storage);
  assert.deepEqual(readSavedSearches(storage), []);
  storage.setItem([...data.keys()][0], "corrupt");
  assert.throws(() => readSavedSearches(storage));
  assert.throws(() => saveBrowserSearch(input, storage));
});
