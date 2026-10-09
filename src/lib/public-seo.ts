import type { Metadata } from "next";
import type { Land, LandType } from "@/lib/types/database";
import { listingMetadataDescription } from "@/lib/zoning";
import { getPropertyDetail, propertyHref } from "@/lib/property-detail-data";
import { matchesLandFilters } from "@/lib/land-search";
import { LAND_CATEGORY_TYPES, landTypeSlug } from "@/lib/utils";

export function listingMetadata(land: Land): Metadata {
  const detail = getPropertyDetail(land.slug);
  const title = (land.seo_title || land.title_th).replace(/\s*[|–-]\s*LandmarketThai\s*$/, "");
  const description = listingMetadataDescription(land);
  const image = land.images?.find(image => image.is_cover)?.url_or_cdn_path ||
    land.images?.[0]?.url_or_cdn_path || detail?.heroImage.src;
  const url = propertyHref(land.slug);
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { url, title, description, ...(image ? { images: [image] } : {}) },
    twitter: { title, description, ...(image ? { images: [image] } : {}) },
  };
}

/** Match the active inventory shown by ListingGrid, including the EEC alias. */
export function archiveInventory(inventory: Land[], province: string, type?: LandType): Land[] {
  return inventory.filter(land => land.status === "active" && !land.deleted_at &&
    matchesLandFilters(land, { province_slug: province, land_type: type }));
}

export function archiveRobots(hasContent: boolean): { index: boolean; follow: boolean } {
  return { index: hasContent, follow: true };
}

export function populatedArchivePaths(inventory: Land[]): string[] {
  const provinces = [...new Set(inventory.map(land => land.province?.slug).filter((slug): slug is string => Boolean(slug)))];
  return provinces.flatMap(province => archiveInventory(inventory, province).length === 0 ? [] : [
    `/land/${province}`,
    ...LAND_CATEGORY_TYPES.filter(type => archiveInventory(inventory, province, type).length > 0)
      .map(type => `/land/${province}/${landTypeSlug(type)}`),
  ]);
}

export function uniqueGalleryImages<T extends { src: string }>(images: T[]): T[] {
  const seen = new Set<string>();
  return images.filter(image => {
    if (!image.src || seen.has(image.src.trim())) return false;
    seen.add(image.src.trim());
    return true;
  });
}
