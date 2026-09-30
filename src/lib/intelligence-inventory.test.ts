import test from "node:test";
import assert from "node:assert/strict";
import { loadIntelligenceInventory } from "@/lib/intelligence-inventory";
import { SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND } from "@/lib/seed-listings";

test("inventory loader labels offline seeds, fetches all pages, respects empty live inventory and propagates failures", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const offline = await loadIntelligenceInventory(async () => { throw new Error("offline must not query"); });
    assert.equal(offline.source, "repository");
    assert.deepEqual(offline.lands, SEED_ACTIVE_LISTINGS);
    assert.notEqual(offline.lands, SEED_ACTIVE_LISTINGS);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
    const calls: number[] = [];
    const inventory = Array.from({ length: 1001 }, (_, index) => ({ ...SEED_37_RAI_LAND, id: `row-${index}`, slug: `row-${index}` }));
    const live = await loadIntelligenceInventory(async (opts) => {
      assert.equal(opts?.limit, 500);
      calls.push(opts?.offset ?? 0);
      return inventory.slice(opts?.offset, (opts?.offset ?? 0) + opts!.limit!);
    });
    assert.equal(live.source, "database");
    assert.deepEqual(live.lands, inventory);
    assert.deepEqual(calls, [0, 500, 1000]);

    const empty = await loadIntelligenceInventory(async () => []);
    assert.deepEqual(empty, { source: "database", lands: [] }, "sold/removed seeds must not reappear in an empty live inventory");
    await assert.rejects(loadIntelligenceInventory(async () => { throw new Error("database unavailable"); }), /database unavailable/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
