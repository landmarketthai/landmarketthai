import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ListingGrid from "@/components/listings/ListingGrid";
import ListingGridSkeleton from "@/components/listings/ListingGridSkeleton";
import FilterBar from "@/components/listings/FilterBar";
import { parseLandSearchParams, parseLandPage, type LandSearchInput } from "@/lib/land-search";
import { getAllProvinces } from "@/lib/neon/queries";
import { SEED_ACTIVE_LISTINGS } from "@/lib/seed-listings";
import SaveSearchForm from "@/components/listings/SaveSearchForm";

export const metadata: Metadata = {
  title: "ที่ดินอุตสาหกรรม EEC ทั่วไทย – ตลาดที่ดิน",
  description:
    "ค้นหาที่ดินอุตสาหกรรม โรงงาน คลังสินค้า EEC Rayong Chonburi ตามขนาด ราคาต่อไร่ และสีผังเมือง",
};

type SearchParams = LandSearchInput;

export default function LandPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">ที่ดินอุตสาหกรรม EEC ทั่วไทย</h1>
          <p className="text-slate-400 text-sm">ค้นหาตามทำเล ขนาด ราคาต่อไร่ และสีผังเมือง · ป้าย Verified แสดงเมื่อทีมงานตรวจสอบแล้ว</p>
        </div>
      </div>

      <Suspense fallback={
        <div className="container-xl section">
          <ListingGridSkeleton />
        </div>
      }>
        <ListingGridWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ListingGridWrapper({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  let filters;
  try { filters = parseLandSearchParams(params); }
  catch (error) {
    return <div className="container-xl section"><p role="alert">{error instanceof Error ? error.message : "Invalid filters"}</p><Link href="/land" className="underline">ล้างตัวกรอง</Link></div>;
  }
  const dbProvinces = await getAllProvinces().catch(() => []);
  const provinces = dbProvinces.length ? dbProvinces : SEED_ACTIVE_LISTINGS.map(land => land.province!);
  return (
    <div className="container-xl section">
      <FilterBar key={JSON.stringify(filters)} filters={filters} provinces={provinces} />
      <SaveSearchForm filters={filters} />
      <ListingGrid
        filters={filters}
        page={parseLandPage(params.page)}
      />
    </div>
  );
}
