import test from "node:test";
import assert from "node:assert/strict";
import { LAND_OVERLAY_METADATA, ZONING_METADATA, getLandOverlayContext } from "./land-overlays.ts";
import { SEED_37_RAI_LAND, SEED_101_KABIN_LAND } from "./seed-listings.ts";
import { ZONING_COLORS, ZONING_LABELS } from "./utils.ts";

test("overlay metadata reuses every repo zoning label and supplies no fabricated geometry", () => {
  assert.deepEqual(Object.keys(ZONING_METADATA).sort(), Object.keys(ZONING_LABELS).sort());
  for (const metadata of Object.values(ZONING_METADATA)) {
    assert.equal(metadata.label, ZONING_LABELS[metadata.code]);
    assert.equal(metadata.color, ZONING_COLORS[metadata.code]);
    assert.ok(metadata.source);
  }
  assert.deepEqual(LAND_OVERLAY_METADATA.map((overlay) => overlay.id), ["zoning", "eec", "industrial"]);
  for (const overlay of LAND_OVERLAY_METADATA) {
    assert.equal(overlay.geometry, null);
    assert.ok(overlay.source);
    assert.ok(overlay.limitation);
  }
});

test("EEC province context stays separate from a parcel's reported flag", () => {
  const context = getLandOverlayContext({ ...SEED_37_RAI_LAND, is_eec: false });
  assert.equal(context.eec.reportedByListing, false);
  assert.equal(context.eec.provinceContext, true);
  assert.equal(context.humanReviewRequired, true);
  assert.equal(context.geometry, null);
  assert.equal(getLandOverlayContext({ ...SEED_37_RAI_LAND, province: undefined }).eec.provinceContext, null);
});

test("industrial category and nearby landmarks never invent missing zoning or EEC status", () => {
  const context = getLandOverlayContext({ ...SEED_101_KABIN_LAND, zoning: null, zoning_info: null });
  assert.equal(context.zoning, null);
  assert.equal(context.industrial.reportedByListingCategory, true);
  assert.equal(context.eec.reportedByListing, false);
  assert.equal(context.eec.provinceContext, false);
  assert.deepEqual(context.industrial.reportedNearbyLandmarks, SEED_101_KABIN_LAND.nearby_landmarks);
  assert.equal(getLandOverlayContext({ ...SEED_101_KABIN_LAND, land_type: "investment" }).industrial.reportedByListingCategory, false);
});
