import type { Land, ListingStatus } from "@/lib/types/database";

export interface PropertySearchFilters {
  q?: string;
  province?: string;
  type?: string;
  property_type?: string;
  transaction_type?: string;
  min_price?: string;
  max_price?: string;
  min_size?: string;
  max_size?: string;
  history?: string;
  sort?: string;
}

export function hasCoordinates<T extends Pick<Land, "lat" | "lng">>(land: T): land is T & { lat: number; lng: number } {
  return typeof land.lat === "number" && Number.isFinite(land.lat) && Math.abs(land.lat) <= 90 &&
    typeof land.lng === "number" && Number.isFinite(land.lng) && Math.abs(land.lng) <= 180;
}

function bound(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function searchProperties(listings: Land[], filters: PropertySearchFilters = {}): Land[] {
  const terms = (filters.q ?? "").trim().toLocaleLowerCase("th-TH").split(/\s+/).filter(Boolean);
  const minPrice = bound(filters.min_price), maxPrice = bound(filters.max_price);
  const minSize = bound(filters.min_size), maxSize = bound(filters.max_size);
  const type = filters.type?.replace(/-/g, "_");
  const results = listings.filter((land) => {
    if (land.deleted_at || land.status !== (filters.history === "1" ? "sold" : "active")) return false;
    // Canonical inventory currently contains sale listings only.
    if (filters.transaction_type && filters.transaction_type !== "sale") return false;
    if (filters.province && land.province?.slug !== filters.province) return false;
    if (type && land.land_type !== type && !(type === "eec" && land.is_eec)) return false;
    if (filters.property_type && land.property_type !== filters.property_type) return false;
    if (minPrice !== null && (land.price_per_rai == null || land.price_per_rai < minPrice) || maxPrice !== null && (land.price_per_rai == null || land.price_per_rai > maxPrice)) return false;
    if (minSize !== null && (land.size_rai == null || land.size_rai < minSize) || maxSize !== null && (land.size_rai == null || land.size_rai > maxSize)) return false;
    const searchable = [land.title_th, land.slug, land.district, land.province?.name_th,
      land.province?.name_en, land.province?.slug, ...(land.nearby_landmarks ?? [])].join(" ").toLocaleLowerCase("th-TH");
    return terms.every((term) => searchable.includes(term));
  });
  return results.sort((a, b) => {
    if (filters.sort === "price_asc") return (a.price_per_rai ?? Infinity) - (b.price_per_rai ?? Infinity) || a.id.localeCompare(b.id);
    if (filters.sort === "size_desc") return (b.size_rai ?? -Infinity) - (a.size_rai ?? -Infinity) || a.id.localeCompare(b.id);
    return b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);
  });
}

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: "เปิดขาย", reserved: "จองแล้ว", sold: "ปิดดีลแล้ว", draft: "ฉบับร่าง", archived: "เก็บถาวร", expired: "หมดอายุ",
};

export function listingUpdatedLabel(updatedAt: string) {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? "ไม่ระบุวันที่" : date.toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  });
}
