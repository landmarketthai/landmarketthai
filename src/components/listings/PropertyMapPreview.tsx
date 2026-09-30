"use client";

import Link from "next/link";
import { useState } from "react";
import type { Land } from "@/lib/types/database";
import PropertyMap from "./PropertyMap";
import { hasCoordinates } from "@/lib/property-search";

export default function PropertyMapPreview({ listings }: { listings: Land[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="mb-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{listings.length} แปลง · {listings.filter(hasCoordinates).length} แปลงมีพิกัด</p>
        <Link href="/search" className="font-semibold text-blue-700 underline">ค้นหาและเลือกแปลงบนแผนที่</Link>
      </div>
      <PropertyMap listings={listings} selectedId={selectedId} onSelect={setSelectedId} className="h-[320px] sm:h-[380px]" />
    </div>
  );
}
