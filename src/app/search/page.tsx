import type { Metadata } from "next";
import SearchExperience, { type SearchValues } from "@/components/search/SearchExperience";
import { searchProperties } from "@/lib/neon/queries";
import { parsePropertySearchParams } from "@/lib/marketplace/search-filters";
import { loadSearchContext } from "@/lib/search-context";

export const metadata: Metadata = {
  title: "ค้นหาอสังหาริมทรัพย์",
  description: "ค้นหาอสังหาริมทรัพย์จากข้อมูลจริง พร้อมแผนที่และตัวกรองทำเล ราคา และขนาด",
  alternates: { canonical: "/search" },
  openGraph: { url: "/search" },
};

type Params = Record<string, string | string[] | undefined>;

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  const filters = parsePropertySearchParams(params);
  const text = (value: number | undefined) => value == null ? undefined : String(value);
  const initialMode = params.get("view") === "map" ? "map" : "list";
  const values: SearchValues = {
    q: filters.q,
    property_type: filters.property_type,
    status: filters.status,
    province: filters.province_slug,
    district: filters.district,
    subdistrict: filters.subdistrict,
    min_price: text(filters.min_price),
    max_price: text(filters.max_price),
    min_price_per_rai: text(filters.min_price_per_rai),
    max_price_per_rai: text(filters.max_price_per_rai),
    min_size_rai: text(filters.min_size_rai),
    max_size_rai: text(filters.max_size_rai),
    min_usable_area_sqm: text(filters.min_usable_area_sqm),
    max_usable_area_sqm: text(filters.max_usable_area_sqm),
    min_frontage_m: text(filters.min_frontage_m),
    min_depth_m: text(filters.min_depth_m),
    min_road_width_m: text(filters.min_road_width_m),
    zoning: filters.zoning,
    eec: filters.eec === true ? true : undefined,
    location_precision: filters.location_precision,
    sort: filters.sort,
  };

  const [initialProperties, { provinces, locationOptions, provinceCodes }] = await Promise.all([
    searchProperties({ ...filters, west: undefined, south: undefined, east: undefined, north: undefined, limit: 24, offset: 0 }).catch(() => []),
    loadSearchContext(),
  ]);

  return (
    <SearchExperience
      initialProperties={initialProperties}
      provinces={provinces}
      provinceCodes={provinceCodes}
      locationOptions={locationOptions}
      initialValues={values}
      initialMode={initialMode}
    />
  );
}
