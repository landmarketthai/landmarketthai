export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CoordinateInput {
  lat: number | null;
  lng: number | null;
}

export interface LocationAnchor {
  id: string;
  label: string;
  kind: "province_reference" | "listing_pin" | "port" | "airport" | "road" | "industrial_park";
  coordinates: Coordinates | null;
  precision: "reference" | "approx" | "unknown";
  source: string;
  limitation: string;
}

/** Reference points and reported landmarks; never substitute them for parcel coordinates. */
export const LOCATION_ANCHORS: readonly LocationAnchor[] = [
  ...([
    ["rayong", "ระยอง", 12.6822, 101.2822],
    ["chonburi", "ชลบุรี", 13.3622, 100.9847],
    ["chachoengsao", "ฉะเชิงเทรา", 13.6904, 101.0779],
    ["samut-prakan", "สมุทรปราการ", 13.5991, 100.5998],
    ["ayutthaya", "อยุธยา", 14.3692, 100.5877],
    ["bangkok", "กรุงเทพมหานคร", 13.7563, 100.5018],
  ] as const).map(([id, label, lat, lng]) => ({
    id: `province-${id}`,
    label,
    kind: "province_reference" as const,
    coordinates: { lat, lng },
    precision: "reference" as const,
    source: "supabase/schema.sql: province seed points",
    limitation: "Province reference point, not a province boundary, logistics facility or parcel location.",
  })),
  {
    id: "listing-37-rai-eec-rayong",
    label: "37 ไร่ EEC ระยอง",
    kind: "listing_pin",
    coordinates: { lat: 12.8626284, lng: 101.0948946 },
    precision: "approx",
    source: "src/lib/property-detail-data.ts: 37-rai-eec-rayong mapEmbed",
    limitation: "Existing marketing map pin; parcel boundaries and coordinate accuracy are unverified.",
  },
  {
    id: "listing-101-rai-kabin-buri",
    label: "101 ไร่ กบินทร์บุรี",
    kind: "listing_pin",
    coordinates: { lat: 14.0417619, lng: 101.831066 },
    precision: "approx",
    source: "src/lib/property-detail-data.ts: 101-rai-kabin-buri mapEmbed",
    limitation: "Existing marketing map pin; parcel boundaries and coordinate accuracy are unverified.",
  },
  {
    id: "laem-chabang-port",
    label: "ท่าเรือแหลมฉบัง",
    kind: "port",
    coordinates: null,
    precision: "unknown",
    source: "src/lib/homepage-data.ts: buyer demand landmark",
    limitation: "Repo mentions this landmark but supplies no coordinates; distances are unavailable.",
  },
  {
    id: "suvarnabhumi-airport",
    label: "สุวรรณภูมิ",
    kind: "airport",
    coordinates: null,
    precision: "unknown",
    source: "src/lib/homepage-data.ts: location label",
    limitation: "Repo mentions this landmark but supplies no coordinates; distances are unavailable.",
  },
  {
    id: "road-2026",
    label: "ถนน 2026",
    kind: "road",
    coordinates: null,
    precision: "unknown",
    source: "src/lib/property-detail-data.ts: 37-rai-eec-rayong access",
    limitation: "Reported road access, with no reference point or road geometry; distances are unavailable.",
  },
  {
    id: "gwangdong-industrial-park",
    label: "สวนอุตสาหกรรมกวางตุ้ง",
    kind: "industrial_park",
    coordinates: null,
    precision: "unknown",
    source: "src/lib/property-detail-data.ts: 101-rai-kabin-buri nearby landmark",
    limitation: "Reported opposite the listing; estate coordinates, boundaries and parcel membership are unknown.",
  },
];

export function isValidCoordinates(value: CoordinateInput | null | undefined): value is Coordinates {
  return value != null &&
    typeof value.lat === "number" && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
    typeof value.lng === "number" && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
}

/** Only the listing's own coordinates are usable; unknown coordinates remain unknown. */
export function getLandCoordinates(land: CoordinateInput): Coordinates | null {
  return isValidCoordinates(land) ? { lat: land.lat, lng: land.lng } : null;
}

/** Spherical straight-line distance in km, never driving distance or travel time. */
export function haversineDistanceKm(
  from: CoordinateInput | null | undefined,
  to: CoordinateInput | null | undefined,
): number | null {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) return null;
  const radians = Math.PI / 180;
  const a = Math.sin((to.lat - from.lat) * radians / 2) ** 2 +
    Math.cos(from.lat * radians) * Math.cos(to.lat * radians) *
    Math.sin((to.lng - from.lng) * radians / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export function distanceToAnchorKm(
  origin: CoordinateInput | null | undefined,
  anchor: LocationAnchor,
): number | null {
  return haversineDistanceKm(origin, anchor.coordinates);
}

export interface AnchorDistance {
  anchor: LocationAnchor;
  distanceKm: number;
  distanceKind: "straight_line";
}

export function rankNearbyAnchors(
  origin: (CoordinateInput & { id?: string; slug?: string; title_th?: string }) | null | undefined,
  anchors: readonly LocationAnchor[] = LOCATION_ANCHORS,
): AnchorDistance[] {
  return anchors.flatMap((anchor): AnchorDistance[] => {
    const distanceKm = distanceToAnchorKm(origin, anchor);
    const self = anchor.id === origin?.id || anchor.id === origin?.slug ||
      anchor.id === `listing-${origin?.slug}` || anchor.label === origin?.title_th;
    return self || distanceKm === null || distanceKm <= 0.001 ? [] : [{ anchor, distanceKm, distanceKind: "straight_line" }];
  }).sort((a, b) => a.distanceKm - b.distanceKm ||
    (a.anchor.id < b.anchor.id ? -1 : a.anchor.id > b.anchor.id ? 1 : 0));
}
