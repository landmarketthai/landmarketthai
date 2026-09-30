import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSameOriginMutation, parseSavedSearch, savedSearchUpdateSchema } from "@/lib/saved-searches";
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

test("saved search storage enforces private reads, canonical uniqueness, and explicit consent", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260930010000_add_saved_searches.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public.saved_searches from anon, authenticated/i);
  assert.match(sql, /for select to authenticated using \(\(select auth.uid\(\)\) = user_id\)/i);
  assert.match(sql, /unique \(user_id, search_params\)/i);
  assert.match(sql, /alert_requested = \(alert_requested_at is not null\)/i);
  const route = readFileSync(new URL("../app/api/saved-searches/route.ts", import.meta.url), "utf8");
  assert.match(route, /session.auth.getUser\(\)/);
  assert.match(route, /user_id: user.id/);
  assert.equal((route.match(/\.eq\("user_id", user.id\)/g) ?? []).length, 2);
});
