import type { Metadata } from "next";
import { Suspense } from "react";
import ListingGrid from "@/components/listings/ListingGrid";
import ListingGridSkeleton from "@/components/listings/ListingGridSkeleton";
import FilterBar from "@/components/listings/FilterBar";

export const metadata: Metadata = {
  title: "ที่ดินอุตสาหกรรม EEC ทั่วไทย – ตลาดที่ดิน",
  description:
    "ค้นหาที่ดินอุตสาหกรรม โรงงาน คลังสินค้า EEC Rayong Chonburi ราคาต่อไร่ ทีมงานตรวจสอบประกาศก่อนเผยแพร่",
};

interface SearchParams {
  province?: string;
  type?: string;
  page?: string;
}

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
          <p className="text-slate-400 text-sm">คัดสรรแล้ว ตรวจสอบก่อนทุกครั้ง</p>
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
  return (
    <div className="container-xl section">
      <FilterBar province={params.province} type={params.type} />
      <ListingGrid
        provinceSlug={params.province}
        landType={params.type}
        page={Number(params.page ?? 1)}
      />
    </div>
  );
}
