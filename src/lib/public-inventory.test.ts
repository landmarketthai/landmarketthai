import test from "node:test";
import assert from "node:assert/strict";
import { SEED_37_RAI_LAND } from "./seed-listings.ts";
import { searchProperties } from "./property-search.ts";

test("configured inventory is authoritative even when empty, sold, or unavailable", async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://inventory.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  });
  let response: unknown = [];
  let status = 200;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, "inventory.test");
    assert.equal(url.searchParams.get("status"), "in.(active,reserved,sold)");
    assert.equal(url.searchParams.get("deleted_at"), "is.null");
    assert.ok(!url.searchParams.get("select")?.includes("owner_lead_id"));
    for (const field of ["lat", "lng", "location_precision", "verified_at", "verified_by", "agent:agents(*)"]) {
      assert.ok(url.searchParams.get("select")?.includes(field), `Public inventory must include ${field}`);
    }
    return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
  });
  const { getPublicInventory } = await import("./public-inventory.ts");
  assert.deepEqual(await getPublicInventory(), []);
  response = [{ ...SEED_37_RAI_LAND, status: "sold" }];
  const inventory = await getPublicInventory();
  assert.deepEqual(searchProperties(inventory), []);
  assert.equal(searchProperties(inventory, { history: "1" })[0].slug, SEED_37_RAI_LAND.slug);
  status = 503;
  response = { message: "unavailable", code: "TEST" };
  await assert.rejects(getPublicInventory());
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal((await getPublicInventory()).length, 2);
});
