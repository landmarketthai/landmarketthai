"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Ruler } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { formatMoneyFull, formatRai, formatUpdatedDate, listingStatusLabel } from "@/lib/utils";
import PropertyMap from "./PropertyMap";

interface Props {
  properties: Land[];
}

export default function HomePropertyMap({ properties }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapped = properties.filter((p) => p.lat != null && p.lng != null);
  const selected = properties.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="relative overflow-hidden rounded-[18px] border border-slate-200 shadow-[0_2px_8px_rgba(13,30,70,0.06)]">
        <PropertyMap
          properties={mapped}
          selectedId={selectedId}
          onSelect={setSelectedId}
          scrollWheelZoom={false}
          className="h-[360px] sm:h-[440px] lg:h-[520px]"
        />
        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-[600] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:left-auto sm:w-80">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#0a2a63]">{selected.title_th}</h3>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                aria-label="ปิด"
              >
                ×
              </button>
            </div>
            <AssetMeta property={selected} />
            <Link
              href={`/properties/${selected.slug}`}
              className="btn-green mt-3 w-full justify-center text-sm"
            >
              ดูรายละเอียดทรัพย์
            </Link>
          </div>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:max-h-[520px] lg:grid-cols-1 lg:content-start lg:overflow-y-auto">
        {properties.map((p) => {
          const hasCoords = p.lat != null && p.lng != null;
          const isSelected = p.id === selectedId;
          return (
            <li
              key={p.id}
              className={`rounded-2xl border bg-white p-3 transition ${
                isSelected ? "border-[#2f9e44] ring-2 ring-[#2f9e44]/20" : "border-slate-200"
              }`}
            >
              <button
                type="button"
                disabled={!hasCoords}
                onClick={() => setSelectedId(p.id)}
                className="w-full text-left disabled:cursor-default"
                aria-pressed={isSelected}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-bold leading-snug text-[#0a2a63]">{p.title_th}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${p.status === "sold" ? "bg-red-600" : "bg-emerald-600"}`}>
                    {listingStatusLabel(p)}
                  </span>
                </div>
                <AssetMeta property={p} />
                {!hasCoords && (
                  <div className="mt-1.5 text-[11px] font-medium text-amber-700">ยังไม่มีพิกัดยืนยันบนแผนที่</div>
                )}
              </button>
              <Link
                href={`/properties/${p.slug}`}
                className="mt-1 inline-flex min-h-9 items-center text-sm font-bold text-[#2f9e44] hover:underline"
              >
                ดูรายละเอียด ›
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AssetMeta({ property }: { property: Land }) {
  const price = property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
  const location = [property.district, property.province?.name_th].filter(Boolean).join(" · ");
  const updatedLabel = formatUpdatedDate(property.updated_at);
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {location && (
        <span className="flex items-center gap-1"><MapPin size={12} className="shrink-0" />{location}</span>
      )}
      {property.size_rai != null && (
        <span className="flex items-center gap-1"><Ruler size={12} className="shrink-0" />{formatRai(property.size_rai)}</span>
      )}
      {price != null && <span className="font-bold text-[#0d1f44]">{formatMoneyFull(price)}</span>}
      {property.transaction_type === "sale" && property.price_per_rai != null && (
        <span>{formatMoneyFull(property.price_per_rai)} / ไร่</span>
      )}
      {updatedLabel && <span className="text-slate-400">อัปเดต {updatedLabel}</span>}
    </div>
  );
}
