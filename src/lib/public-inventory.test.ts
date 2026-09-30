import test from "node:test";
import assert from "node:assert/strict";
import { SEED_37_RAI_LAND } from "./seed-listings.ts";
import { searchProperties } from "./property-search.ts";
import { findInventoryComparables } from "./inventory-analytics.ts";

test("public inventory pages past server caps without duplicates, private columns or seed resurrection", async (t) => {
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
  let serverCap = 500;
  let failAfter: string | undefined;
  const cursors: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, "inventory.test");
    assert.equal(url.searchParams.get("status"), "in.(active,reserved,sold)");
    assert.equal(url.searchParams.get("deleted_at"), "is.null");
    assert.ok(!url.searchParams.get("select")?.includes("owner_lead_id"));
    assert.ok(!url.searchParams.get("select")?.split("province:")[0].includes("*"));
    for (const field of ["lat", "lng", "location_precision", "verified_at", "verified_by", "agent:agents(*)"]) {
      assert.ok(url.searchParams.get("select")?.includes(field), `Public inventory must include ${field}`);
    }
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("order"), "id.asc");
    const cursor = url.searchParams.get("id");
    cursors.push(cursor);
    if (cursor && cursor === failAfter) return new Response(JSON.stringify({ message: "page unavailable" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
    const body = Array.isArray(response)
      ? response.filter((row) => !cursor || row.id > cursor.slice(3)).slice(0, serverCap)
      : response;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  const { getPublicInventory } = await import("./public-inventory.ts");
  assert.deepEqual(await getPublicInventory(), []);
  response = [{ ...SEED_37_RAI_LAND, status: "sold" }];
  const inventory = await getPublicInventory();
  assert.deepEqual(searchProperties(inventory), []);
  assert.equal(searchProperties(inventory, { history: "1" })[0].slug, SEED_37_RAI_LAND.slug);
  response = Array.from({ length: 1001 }, (_, index) => ({
    ...SEED_37_RAI_LAND, id: `row-${String(index).padStart(4, "0")}`, slug: `row-${index}`,
  }));
  cursors.length = 0;
  assert.deepEqual(await getPublicInventory(), response);
  assert.deepEqual(cursors, [null, "gt.row-0499", "gt.row-0999", "gt.row-1000"]);
  serverCap = 127;
  cursors.length = 0;
  const capped = await getPublicInventory();
  assert.deepEqual(capped, response, "short server-capped pages must not truncate inventory");
  assert.equal(new Set(capped.map((land) => land.id)).size, 1001, "each public row appears once");
  assert.ok(!capped.some((land) => land.id === SEED_37_RAI_LAND.id), "live rows never merge seeds");
  assert.equal(cursors.length, 9);
  failAfter = "gt.row-0126";
  await assert.rejects(getPublicInventory(), { message: "page unavailable" }, "later-page errors must not return partial inventory or seeds");
  failAfter = undefined;
  response = [
    { ...SEED_37_RAI_LAND, id: "active-comparable", slug: "active-comparable" },
    { ...SEED_37_RAI_LAND, id: "reserved-subject", slug: "reserved-subject", status: "reserved" },
    { ...SEED_37_RAI_LAND, id: "sold-subject", slug: "sold-subject", status: "sold" },
  ];
  const publicInventory = await getPublicInventory();
  assert.deepEqual(searchProperties(publicInventory).map((land) => land.id), ["active-comparable"]);
  const { loadIntelligenceInventory } = await import("./intelligence-inventory.ts");
  const activeInventory = await loadIntelligenceInventory();
  assert.deepEqual(activeInventory.lands.map((land) => land.id), ["active-comparable"]);
  for (const subject of publicInventory.filter((land) => land.status !== "active")) {
    assert.deepEqual(findInventoryComparables(subject, activeInventory.lands).comparables.map(({ land }) => land.id), ["active-comparable"]);
  }
  status = 503;
  response = { message: "unavailable", code: "TEST" };
  await assert.rejects(getPublicInventory());
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal((await getPublicInventory()).length, 2);
});
