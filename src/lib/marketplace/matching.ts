import type { Land, PropertyType, TransactionType, ZoningColor } from "@/lib/types/database";

export interface BuyerMatchCriteria {
  property_type?: PropertyType | null;
  transaction_type: TransactionType;
  preferred_locations: string[];
  province_ids: string[];
  min_size_rai?: number | null;
  max_size_rai?: number | null;
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

  const sizeOk = (input.min_size_rai == null || (property.size_rai != null && property.size_rai >= input.min_size_rai))
    && (input.max_size_rai == null || (property.size_rai != null && property.size_rai <= input.max_size_rai));
  const propertyPrice = property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
  const budgetOk = input.max_price == null || (propertyPrice != null && propertyPrice <= input.max_price);
  const perRaiOk = input.max_price_per_rai == null || (property.price_per_rai != null && property.price_per_rai <= input.max_price_per_rai);
  const zoningOk = input.zoning == null || property.zoning === input.zoning;

  return sizeOk && budgetOk && perRaiOk && zoningOk ? "full" : "near";
}
