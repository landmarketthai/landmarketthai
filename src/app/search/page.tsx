import type { Metadata } from "next";
import SearchExperience, { type SearchValues } from "@/components/search/SearchExperience";
import { getAllProvinces, searchProperties } from "@/lib/neon/queries";

export const metadata: Metadata = {
  title: "ค้นหาที่ดิน โรงงาน โกดัง",
  description: "ค้นหาที่ดิน โรงงาน และโกดังจากข้อมูลจริง พร้อมแผนที่และตัวกรองทำเล ราคา และขนาด",
  alternates: { canonical: "/search" },
};

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const property = one(raw.property_type);
  const status = one(raw.status);
  const sort = one(raw.sort);
  const locationPrecision = one(raw.location_precision);
  const validSorts: Array<NonNullable<SearchValues["sort"]>> = ["newest", "price_asc", "price_desc", "price_per_rai_asc", "size_desc"];
  const initialMode = one(raw.view) === "map" ? "map" : "list";
  const values: SearchValues = {
    q: one(raw.q),
    property_type: property === "land" || property === "factory" || property === "warehouse" ? property : undefined,
    status: status === "active" || status === "sold" ? status : undefined,
    province: one(raw.province),
    district: one(raw.district),
    min_price: one(raw.min_price),
    max_price: one(raw.max_price),
    min_price_per_rai: one(raw.min_price_per_rai),
    max_price_per_rai: one(raw.max_price_per_rai),
    min_size_rai: one(raw.min_size_rai),
    max_size_rai: one(raw.max_size_rai),
    min_frontage_m: one(raw.min_frontage_m),
    min_road_width_m: one(raw.min_road_width_m),
    zoning: one(raw.zoning),
    eec: one(raw.eec) === "1" ? true : undefined,
    location_precision: locationPrecision === "exact" ? "exact" : undefined,
    sort: validSorts.includes(sort as NonNullable<SearchValues["sort"]>) ? sort as NonNullable<SearchValues["sort"]> : undefined,
  };

  const [initialProperties, provinces] = await Promise.all([
    searchProperties({
      q: values.q,
      property_type: values.property_type,
      province_slug: values.province,
      district: values.district,
      min_price: num(values.min_price),
      max_price: num(values.max_price),
      min_price_per_rai: num(values.min_price_per_rai),
      max_price_per_rai: num(values.max_price_per_rai),
      min_size_rai: num(values.min_size_rai),
      max_size_rai: num(values.max_size_rai),
      min_frontage_m: num(values.min_frontage_m),
      min_road_width_m: num(values.min_road_width_m),
      zoning: values.zoning,
      eec: values.eec,
      status: values.status,
      location_precision: values.location_precision,
      sort: values.sort,
      limit: 24,
    }).catch(() => []),
    getAllProvinces().catch(() => []),
  ]);

  return (
    <SearchExperience
      initialProperties={initialProperties}
      provinces={provinces}
      initialValues={values}
      initialMode={initialMode}
    />
  );
}
