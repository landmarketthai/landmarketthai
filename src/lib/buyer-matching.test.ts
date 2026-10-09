import assert from "node:assert/strict";
import test from "node:test";
import { rankBuyerMatches, rankPropertyBuyers, type BuyerCandidate } from "@/lib/buyer-matching";
import { LOCATION_ANCHORS } from "@/lib/location-intelligence";
import type { Land } from "@/lib/types/database";
import { SEED_ACTIVE_LISTINGS, SEED_37_RAI_LAND, SEED_101_KABIN_LAND } from "@/lib/seed-listings";

test("direct listing interest ranks that property first", () => {
  const matches = rankBuyerMatches({ listing_id: SEED_37_RAI_LAND.slug }, SEED_ACTIVE_LISTINGS);
  assert.equal(matches[0]?.land.slug, SEED_37_RAI_LAND.slug);
  assert.ok(matches[0]?.score >= 100);
});

test("Rayong industrial buyer under 100m matches 37 rai ahead of Kabin Buri", () => {
  const matches = rankBuyerMatches({
    province: "ระยอง",
    land_type: "industrial",
    size_min_rai: 20,
    size_max_rai: 50,
    budget_max: 100_000_000,
  }, SEED_ACTIVE_LISTINGS);

  assert.equal(matches[0]?.land.slug, SEED_37_RAI_LAND.slug);
  assert.notEqual(matches[0]?.land.slug, SEED_101_KABIN_LAND.slug);
});

test("returns no arbitrary suggestions when buyer has no requirements", () => {
  assert.deepEqual(rankBuyerMatches({}, SEED_ACTIVE_LISTINGS), []);
});

test("extended criteria score reported zoning, EEC and frontage without treating unknown zoning as a match", () => {
  const matches = rankBuyerMatches({ zoning: "purple", is_eec: true, frontage_min_m: 200 }, SEED_ACTIVE_LISTINGS);
  assert.equal(matches[0].land.id, SEED_37_RAI_LAND.id);
  assert.equal(matches[0].score, 45);
  assert.equal(matches[0].requiresHumanApproval, true);
  const unknown = rankBuyerMatches({ listing_id: SEED_101_KABIN_LAND.slug, zoning: "purple" }, [{ ...SEED_101_KABIN_LAND, zoning: null, zoning_info: null }])[0];
  assert.equal(unknown.score, 100);
  assert.ok(unknown.missingData.some((reason) => reason.includes("ผังสี")));
  assert.ok(!unknown.reasons.some((reason) => reason.includes("ผังสี")));
  assert.equal(rankBuyerMatches({ is_eec: false }, SEED_ACTIVE_LISTINGS)[0].land.id, SEED_101_KABIN_LAND.id);
});

test("budget minimum is used and missing total price never scores as zero", () => {
  assert.equal(rankBuyerMatches({ budget_min: 100_000_000 }, SEED_ACTIVE_LISTINGS)[0].land.id, SEED_101_KABIN_LAND.id);
  const unknown: Land = { ...SEED_37_RAI_LAND, total_price: null };
  assert.deepEqual(rankBuyerMatches({ budget_max: 100_000_000 }, [unknown]), []);
  const match = rankBuyerMatches({ land_type: "industrial", budget_max: 100_000_000 }, [unknown])[0];
  assert.equal(match.score, 25);
  assert.ok(match.missingData.includes("ยังไม่มีราคารวม"));
  assert.deepEqual(rankBuyerMatches({ budget_max: 0 }, SEED_ACTIVE_LISTINGS), []);
  assert.deepEqual(rankBuyerMatches({ budget_max: 0 }, [{ ...unknown, total_price: 0 }]), []);
  assert.deepEqual(rankBuyerMatches({ size_max_rai: 1 }, [{ ...unknown, size_rai: 0 }]), []);
});

test("invalid and inverted requirements are rejected at matching boundary", () => {
  for (const details of [
    { budget_max: NaN }, { budget_max: -1 }, { budget_max: "100000000" },
    { size_min_rai: 50, size_max_rai: 20 }, { budget_min: 100, budget_max: 50 },
    { zoning: "invented" }, { land_type: "invented" }, { is_eec: "false" },
    { anchor_id: "invented", distance_max_km: 10 }, { anchor_id: "province-rayong" },
    { distance_max_km: 10 }, { province: "   " },
  ]) assert.deepEqual(rankBuyerMatches(details, SEED_ACTIVE_LISTINGS), []);
});

test("distance matching uses valid parcel coordinates and explicitly flags missing/approximate points", () => {
  const anchor = LOCATION_ANCHORS.find((entry) => entry.id === "province-rayong")!;
  const atAnchor: Land = { ...SEED_37_RAI_LAND, ...anchor.coordinates!, location_precision: "approx" };
  const details = { anchor_id: anchor.id, distance_max_km: 0 };
  const match = rankBuyerMatches(details, [atAnchor])[0];
  assert.equal(match.score, 15);
  assert.ok(match.reasons[0].includes("0.0"));
  assert.ok(match.missingData.some((reason) => reason.includes("ไม่ใช่ระยะขับรถ")));
  assert.deepEqual(rankBuyerMatches(details, SEED_ACTIVE_LISTINGS), []);
  const unknown = rankBuyerMatches({ ...details, land_type: "industrial" }, [{ ...SEED_37_RAI_LAND, lat: null, lng: null }])[0];
  assert.equal(unknown.score, 25);
  assert.ok(unknown.missingData.some((reason) => reason.includes("พิกัด")));
  const unlocated = rankBuyerMatches({ land_type: "industrial", anchor_id: "laem-chabang-port", distance_max_km: 10 }, [atAnchor])[0];
  assert.equal(unlocated.score, 25);
  const far: Land = { ...atAnchor, lat: 0, lng: 0 };
  assert.deepEqual(rankBuyerMatches(details, [far]), []);
});

test("rankings exclude inactive/deleted inventory and have stable ties and sensible limits", () => {
  const a: Land = { ...SEED_37_RAI_LAND, id: "a", total_price: null };
  const b: Land = { ...a, id: "b" };
  const input = [b, a, { ...a, id: "sold", status: "sold" as const }, { ...a, id: "deleted", deleted_at: "2026-01-01" }];
  const before = structuredClone(input);
  assert.deepEqual(rankBuyerMatches({ land_type: "industrial" }, input).map((match) => match.land.id), ["a", "b"]);
  assert.deepEqual(rankBuyerMatches({ land_type: "industrial" }, [...input].reverse()).map((match) => match.land.id), ["a", "b"]);
  assert.deepEqual(rankBuyerMatches({ land_type: "industrial" }, input, 0), []);
  assert.deepEqual(rankBuyerMatches({ land_type: "industrial" }, input, -1), []);
  assert.equal(rankBuyerMatches({ land_type: "industrial" }, input, 1.9).length, 1);
  assert.deepEqual(input, before);
});

test("reverse ranking uses forward scores, stable buyer IDs, and excludes closed/nonbuyer leads", () => {
  const buyer: BuyerCandidate = { id: "b", lead_type: "buyer", status: "qualified", details: { province: "rayong", land_type: "industrial", zoning: "purple" } };
  const input: BuyerCandidate[] = [buyer, { ...buyer, id: "a" }, { ...buyer, id: "won", status: "won" }, { ...buyer, id: "lost", status: "lost" }, { ...buyer, id: "owner", lead_type: "owner" }, { ...buyer, id: "empty", details: {} }];
  const before = structuredClone(input);
  const matches = rankPropertyBuyers(SEED_37_RAI_LAND, input);
  assert.deepEqual(matches.map((match) => match.buyer.id), ["a", "b"]);
  const forward = rankBuyerMatches(buyer.details, [SEED_37_RAI_LAND])[0];
  for (const match of matches) {
    assert.equal(match.score, forward.score);
    assert.deepEqual(match.reasons, forward.reasons);
    assert.equal(match.requiresHumanApproval, true);
  }
  assert.deepEqual(rankPropertyBuyers({ ...SEED_37_RAI_LAND, status: "draft" }, input), []);
  assert.deepEqual(rankPropertyBuyers(SEED_37_RAI_LAND, input, 0), []);
  assert.deepEqual(input, before);
});
