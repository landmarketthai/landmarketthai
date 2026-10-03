import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCATION_ANCHORS,
  distanceToAnchorKm,
  getLandCoordinates,
  haversineDistanceKm,
  isValidCoordinates,
  rankNearbyAnchors,
} from "./location-intelligence.ts";
import { propertyDetails } from "./property-detail-data.ts";
import { SEED_37_RAI_LAND } from "./seed-listings.ts";

test("haversine is symmetric, handles zero, dateline and antipodal points", () => {
  const origin = { lat: 0, lng: 0 };
  assert.equal(haversineDistanceKm(origin, origin), 0);
  const oneDegree = haversineDistanceKm(origin, { lat: 0, lng: 1 })!;
  assert.ok(Math.abs(oneDegree - 111.195) < 0.001);
  assert.equal(oneDegree, haversineDistanceKm({ lat: 0, lng: 1 }, origin));
  assert.ok(Math.abs(haversineDistanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })! - 2 * oneDegree) < 0.001);
  const antipodal = haversineDistanceKm(origin, { lat: 0, lng: 180 })!;
  assert.ok(Number.isFinite(antipodal));
  assert.ok(Math.abs(antipodal - 180 * oneDegree) < 0.001);
});

test("missing, nonfinite, out-of-range and malformed coordinates never yield distance", () => {
  const valid = { lat: 0, lng: 0 };
  for (const invalid of [null, undefined, { lat: null, lng: 0 }, { lat: 0, lng: null },
    { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 },
    { lat: "0", lng: 0 } as unknown as typeof valid]) {
    assert.equal(isValidCoordinates(invalid), false);
    assert.equal(haversineDistanceKm(invalid, valid), null);
    assert.equal(haversineDistanceKm(valid, invalid), null);
  }
  assert.equal(isValidCoordinates({ lat: -90, lng: 180 }), true);
  assert.deepEqual(getLandCoordinates(SEED_37_RAI_LAND), { lat: 12.8626284, lng: 101.0948946 });
  assert.equal(getLandCoordinates({ ...SEED_37_RAI_LAND, lat: null, lng: null }), null, "never replace an unknown parcel point with a province or marketing pin");
  assert.deepEqual(getLandCoordinates(valid), valid);
});

test("registry pins match existing marketing maps and logistics landmarks retain unknown coordinates", () => {
  assert.equal(new Set(LOCATION_ANCHORS.map((anchor) => anchor.id)).size, LOCATION_ANCHORS.length);
  for (const property of propertyDetails.filter(property => !property.soldOut)) {
    const anchor = LOCATION_ANCHORS.find((entry) => entry.id === `listing-${property.slug}`)!;
    const [lat, lng] = new URL(property.mapEmbed!.embedUrl).searchParams.get("q")!.split(",").map(Number);
    assert.deepEqual(anchor.coordinates, { lat, lng });
    assert.equal(anchor.precision, "approx");
  }
  const logisticsAnchors = LOCATION_ANCHORS.filter((anchor) => ["port", "airport", "road", "industrial_park"].includes(anchor.kind));
  assert.equal(logisticsAnchors.length, 4);
  for (const anchor of logisticsAnchors) {
    assert.equal(anchor.coordinates, null);
    assert.equal(anchor.precision, "unknown");
    assert.equal(distanceToAnchorKm({ lat: 0, lng: 0 }, anchor), null);
    assert.ok(anchor.source);
    assert.ok(anchor.limitation);
  }
});

test("nearby anchor ranking skips unknowns, sorts distances and breaks ties by id without mutation", () => {
  const base = LOCATION_ANCHORS[0];
  const anchors = [
    { ...base, id: "z", coordinates: { lat: 0, lng: 1 } },
    { ...base, id: "unknown", coordinates: null },
    { ...base, id: "a", coordinates: { lat: 0, lng: 1 } },
    { ...base, id: "near", coordinates: { lat: 0, lng: 0 } },
  ];
  assert.deepEqual(rankNearbyAnchors({ lat: 0, lng: 0 }, anchors).map((result) => result.anchor.id), ["a", "z"]);
  assert.deepEqual(anchors.map((anchor) => anchor.id), ["z", "unknown", "a", "near"]);
  assert.equal(rankNearbyAnchors({ lat: 0, lng: 0 }, anchors)[0].distanceKind, "straight_line");
  assert.deepEqual(rankNearbyAnchors(null, anchors), []);
});
