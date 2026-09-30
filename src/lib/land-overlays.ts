import { EEC_PROVINCES } from "@/lib/constants/provinces";
import type { Land, ZoningColor } from "@/lib/types/database";
import { ZONING_COLORS, ZONING_LABELS } from "@/lib/utils";

export interface ZoningMetadata {
  code: ZoningColor;
  label: string;
  color: string;
  source: "src/lib/utils.ts";
}

/** Existing listing labels, not a determination of permitted uses. */
export const ZONING_METADATA: Readonly<Record<ZoningColor, ZoningMetadata>> =
  Object.fromEntries(
    (Object.keys(ZONING_LABELS) as ZoningColor[]).map((code) => [
      code,
      { code, label: ZONING_LABELS[code], color: ZONING_COLORS[code], source: "src/lib/utils.ts" },
    ]),
  ) as Record<ZoningColor, ZoningMetadata>;

export interface LandOverlayMetadata {
  id: "zoning" | "eec" | "industrial";
  label: string;
  source: string;
  geometry: null;
  limitation: string;
}

/** Repo-known context only: no authoritative boundaries are available. */
export const LAND_OVERLAY_METADATA: readonly LandOverlayMetadata[] = [
  {
    id: "zoning",
    label: "Reported listing zoning",
    source: "src/lib/types/database.ts; src/lib/utils.ts",
    geometry: null,
    limitation: "Listing zoning is reported metadata; parcel boundaries, current zoning plans and permitted uses require human verification.",
  },
  {
    id: "eec",
    label: "EEC province context",
    source: "src/lib/constants/provinces.ts",
    geometry: null,
    limitation: "Province context and the listing EEC flag do not establish parcel eligibility, incentives or approved uses.",
  },
  {
    id: "industrial",
    label: "Reported industrial listing context",
    source: "src/lib/types/database.ts; src/lib/seed-listings.ts",
    geometry: null,
    limitation: "An industrial or factory listing category and nearby landmarks do not establish industrial-estate membership or permission to build.",
  },
];

export interface LandOverlayContext {
  zoning: ZoningMetadata | null;
  eec: {
    reportedByListing: boolean;
    provinceContext: boolean | null;
    provinceNames: readonly string[];
  };
  industrial: {
    reportedByListingCategory: boolean;
    reportedNearbyLandmarks: readonly string[];
  };
  geometry: null;
  humanReviewRequired: true;
}

export function getLandOverlayContext(
  land: Pick<Land, "zoning" | "is_eec" | "land_type" | "province" | "nearby_landmarks">,
): LandOverlayContext {
  return {
    zoning: land.zoning ? ZONING_METADATA[land.zoning] ?? null : null,
    eec: {
      reportedByListing: land.is_eec,
      provinceContext: land.province
        ? (EEC_PROVINCES as readonly string[]).includes(land.province.name_th)
        : null,
      provinceNames: EEC_PROVINCES,
    },
    industrial: {
      reportedByListingCategory: land.land_type === "industrial" || land.land_type === "factory",
      reportedNearbyLandmarks: [...(land.nearby_landmarks ?? [])],
    },
    geometry: null,
    humanReviewRequired: true,
  };
}
