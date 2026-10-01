import type { Land, LandType, Province } from "@/lib/types/database";
import { propertyHref } from "@/lib/property-detail-data";

export const SEED_37_RAI_SLUG = "37-rai-eec-rayong";
export const SEED_109_RAI_SLUG = "109-rai-eec-rayong";
export const SEED_101_KABIN_SLUG = "101-rai-kabin-buri";

const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const SEED_RAYONG_PROVINCE: Province = {
  id: "seed-province-rayong",
  name_th: "ระยอง",
  name_en: "Rayong",
  slug: "rayong",
  region: "EEC",
  lat: null,
  lng: null,
};

export const SEED_PRACHIN_PROVINCE: Province = {
  id: "seed-province-prachin-buri",
  name_th: "ปราจีนบุรี",
  name_en: "Prachin Buri",
  slug: "prachin-buri",
  region: "Central",
  lat: null,
  lng: null,
};

const SEED_37_RAI_IMAGE = {
  id: "seed-img-37-rai",
  land_id: "seed-land-37-rai-eec-rayong",
  storage_key: "listings/37-rai-home-thumbnail.png",
  url_or_cdn_path: "/images/listings/37-rai-home-thumbnail.png",
  width: null,
  height: null,
  alt_th: "ภาพโดรนที่ดินอุตสาหกรรม 37 ไร่ ระยอง",
  sort_order: 0,
  is_cover: true,
  created_at: SEED_TIMESTAMP,
};

/** Canonical active 37-rai listing shared by homepage and /land. */
export const SEED_37_RAI_LAND: Land = {
  id: "seed-land-37-rai-eec-rayong",
  public_ref: 0,
  title_th: "ที่ดินอุตสาหกรรม EEC ระยอง",
  slug: SEED_37_RAI_SLUG,
  province_id: SEED_RAYONG_PROVINCE.id,
  district: "นิคมพัฒนา ระยอง",
  land_type: "industrial",
  size_rai: 36.91825,
  zoning: "purple",
  frontage_m: 240,
  price_per_rai: 2_300_000,
  total_price: 84_911_975,
  referral_reward_max: 1_200_000,
  is_eec: true,
  nearby_landmarks: ["ถนนเข้าถึง ปี 2569"],
  description: null,
  lat: 12.8626284,
  lng: 101.0948946,
  location_precision: "exact",
  status: "active",
  is_featured: true,
  seo_title: null,
  seo_description: null,
  created_at: SEED_TIMESTAMP,
  updated_at: SEED_TIMESTAMP,
  deleted_at: null,
  province: SEED_RAYONG_PROVINCE,
  images: [SEED_37_RAI_IMAGE],
};

const SEED_109_RAI_IMAGE = {
  id: "seed-img-109-rai",
  land_id: "seed-land-109-rai-eec-rayong",
  storage_key: "listings/109-rai-home-thumbnail.png",
  url_or_cdn_path: "/images/listings/109-rai-home-thumbnail.png",
  width: null,
  height: null,
  alt_th: "ภาพโดรนที่ดินอุตสาหกรรม 109 ไร่ EEC ระยอง",
  sort_order: 0,
  is_cover: true,
  created_at: SEED_TIMESTAMP,
};

/** Sold 109-rai Rayong listing kept public as a completed deal portfolio item. */
export const SEED_109_RAI_LAND: Land = {
  id: "seed-land-109-rai-eec-rayong",
  public_ref: 0,
  title_th: "ที่ดินอุตสาหกรรม EEC ระยอง 109 ไร่ ใกล้ WHA และ BYD",
  slug: SEED_109_RAI_SLUG,
  province_id: SEED_RAYONG_PROVINCE.id,
  district: "อ.นิคมพัฒนา จ.ระยอง",
  land_type: "industrial",
  size_rai: 109.63,
  zoning: "purple",
  frontage_m: 240,
  price_per_rai: 2_750_000,
  total_price: 301_482_500,
  referral_reward_max: null,
  is_eec: true,
  nearby_landmarks: ["ใกล้ WHA", "ใกล้ BYD"],
  description: "ที่ดินอุตสาหกรรมผังสีม่วงในพื้นที่ EEC อ.นิคมพัฒนา จ.ระยอง ปิดการขายแล้ว",
  lat: 12.8964329,
  lng: 101.1035175,
  location_precision: "approx",
  status: "sold",
  is_featured: false,
  seo_title: "ขายแล้ว – ที่ดินอุตสาหกรรม EEC ระยอง 109 ไร่ | LandmarketThai",
  seo_description: "ผลงานปิดการขายที่ดินอุตสาหกรรม EEC ระยอง 109 ไร่ 2 งาน 52 ตร.ว. ใกล้ WHA และ BYD",
  created_at: SEED_TIMESTAMP,
  updated_at: SEED_TIMESTAMP,
  deleted_at: null,
  province: SEED_RAYONG_PROVINCE,
  images: [SEED_109_RAI_IMAGE],
};

const SEED_101_KABIN_IMAGE = {
  id: "seed-img-101-kabin-buri",
  land_id: "seed-land-101-kabin-buri",
  storage_key: "listings/kabin-buri-101-rai-home-thumbnail.png",
  url_or_cdn_path: "/images/listings/kabin-buri-101-rai-home-thumbnail.png",
  width: null,
  height: null,
  alt_th: "ภาพโดรนที่ดินอุตสาหกรรม 101 ไร่ กบินทร์บุรี",
  sort_order: 0,
  is_cover: true,
  created_at: SEED_TIMESTAMP,
};

/** Active 101-rai Kabin Buri listing. */
export const SEED_101_KABIN_LAND: Land = {
  id: "seed-land-101-kabin-buri",
  public_ref: 0,
  title_th: "ที่ดินอุตสาหกรรม 101 ไร่ กบินทร์บุรี ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง",
  slug: SEED_101_KABIN_SLUG,
  province_id: SEED_PRACHIN_PROVINCE.id,
  district: "อ.กบินทร์บุรี ต.หนองกี่",
  land_type: "industrial",
  size_rai: 101.06,
  zoning: null,
  frontage_m: 700,
  price_per_rai: 1_500_000,
  total_price: 151_590_000,
  referral_reward_max: 2_275_000,
  is_eec: false,
  nearby_landmarks: ["ตรงข้ามสวนอุตสาหกรรมกวางตุ้ง"],
  description: null,
  lat: 14.0417619,
  lng: 101.8310660,
  location_precision: "exact",
  status: "active",
  is_featured: true,
  seo_title: null,
  seo_description: null,
  created_at: SEED_TIMESTAMP,
  updated_at: SEED_TIMESTAMP,
  deleted_at: null,
  province: SEED_PRACHIN_PROVINCE,
  images: [SEED_101_KABIN_IMAGE],
};

export const SEED_PUBLIC_LISTINGS: Land[] = [
  SEED_37_RAI_LAND,
  SEED_101_KABIN_LAND,
  SEED_109_RAI_LAND,
];

export const SEED_ACTIVE_LISTINGS = SEED_PUBLIC_LISTINGS.filter((land) => land.status === "active");
export const SEED_SOLD_SLUGS = new Set<string>([SEED_109_RAI_SLUG]);

export const SEED_LISTING_IMAGES = {
  rayong37: {
    src: "/images/listings/37-rai-home-thumbnail.png",
    alt: "ภาพโดรนที่ดินอุตสาหกรรม 37 ไร่ ระยอง",
  },
  rayong109: {
    src: "/images/listings/109-rai-home-thumbnail.png",
    alt: "ภาพโดรนที่ดินอุตสาหกรรม 109 ไร่ EEC ระยอง",
  },
  kabin101: {
    src: "/images/listings/kabin-buri-101-rai-home-thumbnail.png",
    alt: "ภาพโดรนที่ดินอุตสาหกรรม 101 ไร่ กบินทร์บุรี",
  },
} as const;

export const SEED_37_RAI_META = {
  zoningLabel: "ผังสีม่วงลาย",
  rewardLabel: "ค่าตอบแทนผู้แนะนำสูงสุด",
} as const;

export const SEED_101_KABIN_META = {
  rewardLabel: "ค่าตอบแทนผู้แนะนำสูงสุด",
} as const;

export function getSeedListingImage(land: Land) {
  if (land.slug === SEED_37_RAI_SLUG) {
    return SEED_LISTING_IMAGES.rayong37;
  }
  if (land.slug === SEED_109_RAI_SLUG) {
    return SEED_LISTING_IMAGES.rayong109;
  }
  if (land.slug === SEED_101_KABIN_SLUG) {
    return SEED_LISTING_IMAGES.kabin101;
  }
  return undefined;
}

export function getSeedListingHref(land: Land): string | undefined {
  if (land.slug === SEED_37_RAI_SLUG) {
    return propertyHref(SEED_37_RAI_SLUG);
  }
  if (land.slug === SEED_109_RAI_SLUG) {
    return propertyHref(SEED_109_RAI_SLUG);
  }
  if (land.slug === SEED_101_KABIN_SLUG) {
    return propertyHref(SEED_101_KABIN_SLUG);
  }
  return undefined;
}

export function isSeedSoldOutListing(land: Land) {
  return land.status === "sold";
}

export function isSeedFeaturedListing(land: Land) {
  return (
    land.slug === SEED_37_RAI_SLUG ||
    land.slug === SEED_101_KABIN_SLUG
  );
}

export function resolveListingPresentation(land: Land) {
  const featured = isSeedFeaturedListing(land);
  return {
    imageOverride: getSeedListingImage(land),
    hrefOverride: getSeedListingHref(land),
    soldOut: isSeedSoldOutListing(land),
    featured,
    metaTagLabel: land.slug === SEED_37_RAI_SLUG ? SEED_37_RAI_META.zoningLabel : undefined,
    pricePerRaiLabel: land.slug === SEED_109_RAI_SLUG ? "2.75 ล้าน ฿" : undefined,
    rewardLabel:
      land.slug === SEED_37_RAI_SLUG
        ? SEED_37_RAI_META.rewardLabel
        : land.slug === SEED_101_KABIN_SLUG
          ? SEED_101_KABIN_META.rewardLabel
          : undefined,
  };
}

export function matchesSeedListingFilters(
  land: Land,
  opts?: { province_slug?: string; land_type?: LandType },
): boolean {
  if (opts?.province_slug && land.province?.slug !== opts.province_slug) {
    return false;
  }
  if (opts?.land_type) {
    if (land.land_type === opts.land_type) return true;
    if (opts.land_type === "eec" && land.is_eec) return true;
    return false;
  }
  return true;
}

export function filterSeedPublicListings(opts?: {
  province_slug?: string;
  land_type?: LandType;
}): Land[] {
  return SEED_PUBLIC_LISTINGS.filter(
    (land) =>
      (land.status === "active" || land.status === "sold") &&
      matchesSeedListingFilters(land, opts),
  );
}

export function mergeWithSeedListings(
  dbListings: Land[],
  opts?: { province_slug?: string; land_type?: LandType },
): Land[] {
  const dbSlugs = new Set(dbListings.map((land) => land.slug));
  const seedListings = filterSeedPublicListings(opts).filter(
    (land) => !dbSlugs.has(land.slug),
  );
  return [...dbListings, ...seedListings].filter(
    (land) => (land.status === "active" || land.status === "sold") && !land.deleted_at && matchesSeedListingFilters(land, opts),
  );
}

export function seedListingSortOrder(land: Land) {
  if (isSeedFeaturedListing(land)) return 0;
  if (isSeedSoldOutListing(land)) return 1;
  return 2;
}

export function sortSeedListings(listings: Land[]) {
  return [...listings].sort((a, b) => seedListingSortOrder(a) - seedListingSortOrder(b));
}
