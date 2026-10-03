"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Ruler, Search } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { formatMoneyFull, formatUpdatedDate, listingStatusLabel } from "@/lib/utils";
import { verificationBadges } from "@/lib/marketplace/verification";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, propertySizeLabel } from "@/lib/marketplace/presentation";
import PropertyMap from "./PropertyMap";

interface Props {
  properties: Land[];
}

export default function HomePropertyMap({ properties }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mapped = properties.filter((property) => property.lat != null && property.lng != null);
  const exactCount = mapped.filter((property) => property.location_precision === "exact").length;
  const selected = properties.find((property) => property.id === selectedId) ?? null;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(13,30,70,0.09)] sm:p-6 lg:p-7">
      <div className="mb-5 flex flex-col gap-2 text-center sm:text-left lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[#2f9e44]">ค้นหาทรัพย์บนแผนที่</p>
          <h2 className="mt-1 text-xl font-bold text-[#0a2a63] sm:text-[28px]">ค้นหาอสังหาริมทรัพย์</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            ค้นจากทรัพย์จริงในระบบ แล้วเลือกดูราคา ขนาด และตำแหน่งบนแผนที่ (แยกพิกัดแบบ Exact กับตำแหน่งโดยประมาณ)
          </p>
        </div>
        <Link href="/search?view=map" className="text-sm font-semibold text-blue-700 hover:underline">
          เปิดค้นหาแบบเต็ม ›
        </Link>
      </div>

      <form action="/search" method="get" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(280px,1.5fr)_170px_auto]">
        <input type="hidden" name="view" value="map" />
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">ค้นหาทำเล</span>
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input name="q" className="input pl-10" placeholder="จังหวัด / อำเภอ / ตำบล / นิคม / ทำเล" />
        </label>
        <select name="property_type" className="input" defaultValue="" aria-label="ประเภททรัพย์">
          <option value="">ทุกประเภท</option>
          {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{PROPERTY_TYPE_LABELS[type]}</option>)}
        </select>
        <button type="submit" className="btn-green w-full justify-center sm:col-span-2 lg:col-span-1 lg:w-auto">
          <Search size={16} /> ค้นหาทรัพย์
        </button>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          พบ {properties.length.toLocaleString("th-TH")} รายการ · {mapped.length.toLocaleString("th-TH")} รายการมีพิกัดแผนที่ · {exactCount.toLocaleString("th-TH")} พิกัดแบบ Exact
        </span>
        <span className="font-medium text-slate-400">แตะหมุดเพื่อดูทรัพย์ · เลื่อนผ่านรายการเพื่อเทียบตำแหน่ง</span>
      </div>

      {!mapped.length ? <div role="status" className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        <p>ยังไม่มีทรัพย์ที่มีพิกัดแผนที่ในขณะนี้</p>
        <Link href="/search" className="mt-2 inline-block font-semibold text-blue-700 hover:underline">ดูรายการทรัพย์ทั้งหมด / ลองค้นหาใหม่ →</Link>
      </div> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 shadow-[0_2px_8px_rgba(13,30,70,0.06)]">
          <PropertyMap
            properties={mapped}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            scrollWheelZoom={false}
            className="h-[390px] sm:h-[470px] lg:h-[560px]"
          />
          {selected && (
            <div className="absolute inset-x-3 bottom-3 z-[600] max-h-[80%] overflow-y-auto break-words [overflow-wrap:anywhere] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:w-80">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${selected.status === "sold" ? "bg-slate-500" : "bg-emerald-600"}`}>
                      {listingStatusLabel(selected)}
                    </span>
                    {verificationBadges(selected).map((badge) => (
                      <span key={badge} className="text-[10px] font-bold text-emerald-700">✓ {badge}</span>
                    ))}
                    <span className={`text-[10px] font-bold ${selected.location_precision === "exact" ? "text-blue-700" : "text-amber-700"}`}>
                      {selected.location_precision === "exact" ? "พิกัดแบบ Exact" : "≈ ตำแหน่งโดยประมาณ"}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#0a2a63]">{selected.title_th}</h3>
                </div>
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
              <Link href={`/property/${selected.slug}`} className="btn-green mt-3 w-full justify-center text-sm">
                ดูรายละเอียดทรัพย์
              </Link>
            </div>
          )}
        </div>

        <ul className="grid max-h-[480px] content-start gap-3 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2 lg:max-h-[560px] lg:grid-cols-1 lg:content-start lg:overflow-y-auto lg:pr-1">
          {properties.map((property) => {
            const hasMapCoords = property.lat != null && property.lng != null;
            const isSelected = property.id === selectedId;
            const isHovered = property.id === hoveredId;
            return (
              <li
                key={property.id}
                onMouseEnter={() => hasMapCoords && setHoveredId(property.id)}
                onMouseLeave={() => setHoveredId((current) => (current === property.id ? null : current))}
                className={`rounded-2xl border bg-white p-3 transition-all ${
                  isSelected
                    ? "border-[#2f9e44] shadow-md ring-2 ring-[#2f9e44]/20"
                    : isHovered
                      ? "border-emerald-300 shadow-sm"
                      : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <button
                  type="button"
                  disabled={!hasMapCoords}
                  onClick={() => setSelectedId(property.id)}
                  className="w-full text-left disabled:cursor-default"
                  aria-pressed={isSelected}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-bold leading-snug text-[#0a2a63]">{property.title_th}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${property.status === "sold" ? "bg-slate-500" : "bg-emerald-600"}`}>
                      {listingStatusLabel(property)}
                    </span>
                  </div>
                  <AssetMeta property={property} />
                  {!hasMapCoords ? (
                    <div className="mt-1.5 text-[11px] font-medium text-amber-700">ยังไม่มีพิกัดบนแผนที่</div>
                  ) : property.location_precision !== "exact" ? (
                    <div className="mt-1.5 text-[11px] font-medium text-amber-700">ตำแหน่งโดยประมาณ</div>
                  ) : null}
                </button>
                <Link href={`/property/${property.slug}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-bold text-[#2f9e44] hover:underline">
                  ดูรายละเอียด ›
                </Link>
              </li>
            );
          })}
        </ul>
      </div>}

      <div className="mt-5 grid gap-2 min-[390px]:grid-cols-2 lg:grid-cols-3">
        <Link href="/sell" className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
          ฝากขายทรัพย์
        </Link>
        <Link href="/buy-request" className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
          ฝากความต้องการซื้อ
        </Link>
        <Link href="/search" className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 min-[390px]:col-span-2 lg:col-span-1">
          ดูทรัพย์ทั้งหมด
        </Link>
      </div>
    </div>
  );
}

function AssetMeta({ property }: { property: Land }) {
  const price = property.total_price;
  const location = [property.district, property.province?.name_th].filter(Boolean).join(" · ");
  const updatedLabel = formatUpdatedDate(property.updated_at);
  const sizeLabel = propertySizeLabel(property);
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {location && <span className="flex min-w-0 items-center gap-1 break-words"><MapPin size={12} className="shrink-0" />{location}</span>}
      {sizeLabel && <span className="flex items-center gap-1"><Ruler size={12} className="shrink-0" />{sizeLabel}</span>}
      {price != null && <span className="font-bold text-[#0d1f44]">{formatMoneyFull(price)}</span>}
      {property.price_per_rai != null && <span>{formatMoneyFull(property.price_per_rai)} / ไร่</span>}
      {updatedLabel && <span className="text-slate-400">อัปเดต {updatedLabel}</span>}
    </div>
  );
}
