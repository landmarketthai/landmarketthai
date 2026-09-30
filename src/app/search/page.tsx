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
  const transaction = one(raw.transaction_type);
  const property = one(raw.property_type);
  const initialMode = one(raw.view) === "map" ? "map" : "list";
  const values: SearchValues = {
    q: one(raw.q),
    transaction_type: transaction === "sale" || transaction === "rent" ? transaction : undefined,
    property_type: property === "land" || property === "factory" || property === "warehouse" ? property : undefined,
    province: one(raw.province),
    district: one(raw.district),
    min_price: one(raw.min_price),
    max_price: one(raw.max_price),
    min_price_per_rai: one(raw.min_price_per_rai),
    max_price_per_rai: one(raw.max_price_per_rai),
    min_size_rai: one(raw.min_size_rai),
    max_size_rai: one(raw.max_size_rai),
    zoning: one(raw.zoning),
    eec: one(raw.eec) === "1" ? true : undefined,
  };

  const [initialProperties, provinces] = await Promise.all([
    searchProperties({
      q: values.q,
      transaction_type: values.transaction_type,
      property_type: values.property_type,
      province_slug: values.province,
      district: values.district,
      min_price: num(values.min_price),
      max_price: num(values.max_price),
      min_price_per_rai: num(values.min_price_per_rai),
      max_price_per_rai: num(values.max_price_per_rai),
      min_size_rai: num(values.min_size_rai),
      max_size_rai: num(values.max_size_rai),
      zoning: values.zoning,
      eec: values.eec,
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
