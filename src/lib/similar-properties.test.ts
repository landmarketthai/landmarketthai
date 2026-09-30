import assert from "node:assert/strict";
import test from "node:test";
import type { Land } from "@/lib/types/database";
import { SEED_37_RAI_LAND } from "@/lib/seed-listings";
import { rankSimilarProperties } from "@/lib/similar-properties";

const source = SEED_37_RAI_LAND;
function candidate(slug: string, changes: Partial<Land> = {}): Land {
  return { ...source, id: slug, slug, ...changes };
}

test("similar listings favor local/type/zoning matches and size/price proximity", () => {
  const close = candidate("close", { size_rai: 38, price_per_rai: 2_400_000 });
  const distant = candidate("distant", { size_rai: 200, price_per_rai: 15_000_000 });
  const otherProvince = candidate("other-province", { province_id: "other", province: undefined });
  assert.deepEqual(rankSimilarProperties(source, [distant, otherProvince, close]).map((land) => land.slug),
    ["close", "distant", "other-province"]);
});

test("similar discovery broadens beyond same province AND type without suggesting unrelated stock", () => {
  const sourceWithoutZoning = { ...source, zoning: null, is_eec: false };
  const otherProvince = candidate("same-type", { province_id: "other", province: undefined, zoning: null, is_eec: false });
  const otherType = candidate("same-province", { land_type: "warehouse", zoning: null, is_eec: false });
  const unrelated = candidate("unrelated", { ...otherProvince, id: "unrelated", slug: "unrelated", land_type: "investment" });
  assert.deepEqual(rankSimilarProperties(sourceWithoutZoning, [otherProvince, unrelated, otherType]).map((land) => land.slug),
    ["same-province", "same-type"]);
});

test("similar discovery excludes source aliases, nonpublic stock and duplicate slugs", () => {
  const good = candidate("good");
  const stock = [source, { ...source, id: "db-source" }, good, { ...good, id: "duplicate" },
    candidate("sold", { status: "sold" }), candidate("draft", { status: "draft" }),
    candidate("deleted", { deleted_at: "2026-01-01" })];
  assert.deepEqual(rankSimilarProperties(source, stock).map((land) => land.slug), ["good"]);
});

test("equal scores have deterministic ordering independent of database order", () => {
  const a = candidate("a");
  const b = candidate("b");
  assert.deepEqual(rankSimilarProperties(source, [b, a]), rankSimilarProperties(source, [a, b]));
  assert.deepEqual(rankSimilarProperties(source, [b, a], 1), [a]);
  assert.deepEqual(rankSimilarProperties(source, [a], 0), []);
});

test("missing/invalid numbers do not create NaN ranking and joined province slugs match seed IDs", () => {
  const joined = candidate("joined", { province_id: "db-rayong", size_rai: NaN, price_per_rai: 0 });
  const distant = candidate("distant", { province_id: "other", province: undefined });
  assert.equal(rankSimilarProperties(source, [distant, joined])[0]?.slug, "joined");
});
