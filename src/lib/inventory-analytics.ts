import { zoningColors, sharesZoning } from "@/lib/zoning";
import type { Land } from "@/lib/types/database";
import { haversineDistanceKm } from "@/lib/location-intelligence";

export const INVENTORY_SCOPE = "LandmarketThai active inventory only";
export const INVENTORY_PRICE_BASIS = "Listing asking prices; not sale prices, market-wide statistics, or valuations";

export interface PriceStatistics {
  /** Number of listings with a finite, positive asking price for this metric. */
  count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  average: number | null;
}

export interface InventoryPriceSummary {
  listingCount: number;
  pricePerRai: PriceStatistics;
  totalPrice: PriceStatistics;
}

export interface InventoryPriceGroup extends InventoryPriceSummary {
  key: string;
  label: string;
}

export interface InventoryAnalytics extends InventoryPriceSummary {
  scope: typeof INVENTORY_SCOPE;
  priceBasis: typeof INVENTORY_PRICE_BASIS;
  currency: "THB";
  byProvince: InventoryPriceGroup[];
  byLandType: InventoryPriceGroup[];
  byZoning: InventoryPriceGroup[];
}

export interface InventoryComparable {
  land: Land;
  reasons: string[];
  sizeDifferenceRatio: number | null;
  /** Straight-line distance between supplied coordinates, not a road distance. */
  distanceKm: number | null;
}

export interface InventoryComparables extends InventoryPriceSummary {
  scope: typeof INVENTORY_SCOPE;
  priceBasis: typeof INVENTORY_PRICE_BASIS;
  comparables: InventoryComparable[];
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function statistics(values: readonly (number | null)[]): PriceStatistics {
  const prices = values.filter(positive).sort((a, b) => a - b);
  const count = prices.length;
  const middle = Math.floor(count / 2);
  return {
    count,
    min: prices[0] ?? null,
    max: prices[count - 1] ?? null,
    median: count === 0 ? null : count % 2 ? prices[middle] : prices[middle - 1] / 2 + prices[middle] / 2,
    average: count === 0 ? null : prices.reduce((sum, value) => sum + value / count, 0),
  };
}

function summary(lands: readonly Land[]): InventoryPriceSummary {
  return {
    listingCount: lands.length,
    pricePerRai: statistics(lands.map((land) => land.price_per_rai)),
    // Do not infer total asking prices from size: missing asking prices stay missing.
    totalPrice: statistics(lands.map((land) => land.total_price)),
  };
}

function activeInventory(lands: readonly Land[]): Land[] {
  return lands.filter((land) => land.status === "active" && !land.deleted_at);
}

function groupInventory(lands: readonly Land[], keyOf: (land: Land) => string, labelOf: (land: Land) => string): InventoryPriceGroup[] {
  const groups = new Map<string, Land[]>();
  for (const land of lands) {
    const key = keyOf(land);
    const group = groups.get(key) ?? [];
    group.push(land);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => ({
    key,
    label: group.map(labelOf).filter(Boolean).sort()[0] ?? key,
    ...summary(group),
  })).sort((a, b) => a.key.localeCompare(b.key, "en"));
}

/** Summarizes only the supplied LandmarketThai active inventory; no external market data. */
export function getInventoryAnalytics(lands: readonly Land[]): InventoryAnalytics {
  const active = activeInventory(lands);
  return {
    scope: INVENTORY_SCOPE,
    priceBasis: INVENTORY_PRICE_BASIS,
    currency: "THB",
    ...summary(active),
    byProvince: groupInventory(active, (land) => land.province_id || "unknown", (land) => land.province?.name_th ?? ""),
    byLandType: groupInventory(active, (land) => land.land_type || "unknown", (land) => land.land_type || "Unknown land type"),
    byZoning: groupInventory(active, (land) => zoningColors(land).sort().join("+") || "unknown", (land) => zoningColors(land).sort().join(" / ") || "Unknown zoning"),
  };
}

function sameProvince(subject: Land, candidate: Land): boolean {
  return Boolean(
    (subject.province_id && subject.province_id === candidate.province_id)
    || (subject.province?.slug && subject.province.slug === candidate.province?.slug),
  );
}

/** Same-province/type asking-price references, ordered by known zoning, size, then proximity. */
export function findInventoryComparables(subject: Land, lands: readonly Land[], limit = 5): InventoryComparables {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const comparables = activeInventory(lands)
    .filter((land) => land.id !== subject.id && land.slug !== subject.slug
      && subject.land_type && land.land_type === subject.land_type
      && sameProvince(subject, land) && positive(land.price_per_rai))
    .map((land): InventoryComparable => ({
      land,
      reasons: ["Same province", "Same land type", ...(sharesZoning(subject, land) ? ["Same reported zoning"] : [])],
      sizeDifferenceRatio: positive(subject.size_rai) && positive(land.size_rai)
        ? Math.abs(land.size_rai - subject.size_rai) / subject.size_rai : null,
      distanceKm: haversineDistanceKm(subject, land),
    }))
    .sort((a, b) => {
      const zoningA = Number(Boolean(sharesZoning(subject, a.land)));
      const zoningB = Number(Boolean(sharesZoning(subject, b.land)));
      return zoningB - zoningA
        || (a.sizeDifferenceRatio ?? Infinity) - (b.sizeDifferenceRatio ?? Infinity)
        || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
        || a.land.id.localeCompare(b.land.id, "en")
        || a.land.slug.localeCompare(b.land.slug, "en");
    })
    .slice(0, count);
  return {
    scope: INVENTORY_SCOPE,
    priceBasis: INVENTORY_PRICE_BASIS,
    comparables,
    ...summary(comparables.map((comparable) => comparable.land)),
  };
}
