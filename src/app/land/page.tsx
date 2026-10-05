import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LandArchive from "@/components/search/LandArchive";
import ListingGridSkeleton from "@/components/listings/ListingGridSkeleton";
import { parseLandSearchParams, type LandSearchInput } from "@/lib/land-search";

export const metadata: Metadata = {
  alternates: { canonical: "/land" },
  openGraph: { url: "/land" },
  title: "ค้นหาและฝากขายอสังหาริมทรัพย์ – ตลาดที่ดิน",
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
      <Suspense fallback={
        <div className="container-xl section">
          <ListingGridSkeleton />
        </div>
      }>
        <LandArchiveWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LandArchiveWrapper({
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
  return <LandArchive filters={filters} />;
}
