import type { Land, PropertyType, TransactionType, ZoningColor } from "@/lib/types/database";
import { isUsableAreaOnly, matchesSizeCriteria } from "@/lib/marketplace/search-filters";
import { zoningColors } from "@/lib/zoning";

export interface BuyerMatchCriteria {
  property_type?: PropertyType | null;
  transaction_type: TransactionType;
  preferred_locations: string[];
  province_ids: string[];
  min_size_rai?: number | null;
  max_size_rai?: number | null;
  min_usable_area_sqm?: number | null;
  max_usable_area_sqm?: number | null;
  max_price?: number | null;
  max_price_per_rai?: number | null;
  zoning?: ZoningColor | null;
}

export type BuyerMatchKind = "full" | "near" | null;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("th");
}

export function classifyBuyerMatch(property: Land, input: BuyerMatchCriteria): BuyerMatchKind {
  if (property.status !== "active") return null;
  if (property.transaction_type !== input.transaction_type) return null;
  if (input.property_type && property.property_type !== input.property_type) return null;

  const locationText = [
    property.title_th,
    property.address,
    property.subdistrict,
    property.district,
    property.province?.name_th,
  ].filter(Boolean).join(" ").toLocaleLowerCase("th");

  const provinceOk = input.province_ids.length === 0 || input.province_ids.includes(property.province_id);
  const preferredLocationOk = input.preferred_locations.length === 0
    || input.preferred_locations.some((location) => locationText.includes(normalized(location)));

  // "Near" results may relax numeric/zoning constraints, but never the requested geography.
  if (!provinceOk || !preferredLocationOk) return null;

  const sizeOk = matchesSizeCriteria(property, input);
  const budgetOk = input.max_price == null || (property.total_price != null && property.total_price <= input.max_price);
  const perRaiOk = isUsableAreaOnly(property) || input.max_price_per_rai == null || (property.price_per_rai != null && property.price_per_rai <= input.max_price_per_rai);
  const zoningOk = input.zoning == null || zoningColors(property).includes(input.zoning);

  return sizeOk && budgetOk && perRaiOk && zoningOk ? "full" : "near";
}

export async function findBuyerMatches(
  input: BuyerMatchCriteria,
  fetchPage: (limit: number, offset: number) => Promise<Land[]>,
): Promise<{ full: Land[]; near: Land[]; status: "available" | "limited" | "unavailable" }> {
  const matches: { full: Land[]; near: Land[] } = { full: [], near: [] };
  // ponytail: scan at most 1,000 filtered properties; report the cap, use SQL ranking if it grows.
  for (let offset = 0; offset < 1000; offset += 100) {
    let candidates: Land[];
    try { candidates = await fetchPage(100, offset); }
    catch { return { full: [], near: [], status: "unavailable" }; }
    for (const property of candidates) {
      const kind = classifyBuyerMatch(property, input);
      if (kind && matches[kind].length < 12) matches[kind].push(property);
    }
    // Later pages cannot change the first 12 ranked results in either group.
    if (candidates.length < 100) return { ...matches, status: matches.full.length === 12 || matches.near.length === 12 ? "limited" : "available" };
    if (matches.full.length === 12 && matches.near.length === 12) return { ...matches, status: "limited" };
  }
  return { ...matches, status: "limited" };
}
