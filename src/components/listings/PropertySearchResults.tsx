"use client";

import { useId, useState } from "react";
import type { Land } from "@/lib/types/database";
import { hasCoordinates } from "@/lib/property-search";
import { resolveListingPresentation } from "@/lib/seed-listings";
import ListingCard from "./ListingCard";
import PropertyMap from "./PropertyMap";

export default function PropertySearchResults({ listings }: { listings: Land[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const prefix = useId();
  const selected = listings.some((land) => land.id === selectedId) ? selectedId : null;
  const mappedCount = listings.filter(hasCoordinates).length;
  function selectFromMap(id: string) {
    setSelectedId(id);
    const card = document.getElementById(`${prefix}-${id}`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600" role="status">พบ {listings.length} แปลง · {mappedCount} หมุดบนแผนที่{mappedCount < listings.length ? ` · ${listings.length - mappedCount} แปลงยังไม่มีพิกัด` : ""}</p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 grid gap-5 sm:grid-cols-2 lg:order-1 lg:max-h-[720px] lg:overflow-y-auto lg:p-1">
          {!listings.length && <p className="rounded-xl bg-slate-50 p-6 sm:col-span-2">ไม่พบทรัพย์ตามเงื่อนไข ลองเปลี่ยนตัวกรองหรือติดต่อทีมงาน</p>}
          {listings.map((land, index) => (
            <div key={land.id} id={`${prefix}-${land.id}`} tabIndex={-1}
              onFocus={() => setSelectedId(land.id)}
              className={`rounded-xl ${selected === land.id ? "ring-4 ring-emerald-500" : ""}`}>
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold">แปลง {index + 1}</span>
                {hasCoordinates(land) ? <button type="button" aria-pressed={selected === land.id}
                  onClick={() => setSelectedId(land.id)} className="min-h-11 rounded px-3 font-semibold text-blue-700 hover:bg-blue-50">เลือกบนแผนที่</button>
                  : <span className="text-slate-500">ยังไม่มีพิกัด</span>}
              </div>
              <ListingCard land={land} {...resolveListingPresentation(land)} />
            </div>
          ))}
        </div>
        <div className="order-1 lg:sticky lg:top-20 lg:order-2">
          <PropertyMap listings={listings} selectedId={selected} onSelect={selectFromMap} className="h-[360px] sm:h-[480px] lg:h-[640px]" />
          <p className="mt-2 text-xs text-slate-500">เลือกหมุดเพื่อไฮไลต์การ์ด หรือเลือกการ์ดเพื่อดูตำแหน่ง · ตำแหน่งโดยประมาณระบุในหมุด</p>
        </div>
      </div>
    </div>
  );
}
