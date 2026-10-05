"use client";

import Image from "next/image";
import Link from "next/link";
import { Building2, MapPin, Ruler, Tag } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { formatMoneyFull, formatUpdatedDate, listingStatusLabel, ZONING_LABELS } from "@/lib/utils";
import { verificationBadges } from "@/lib/marketplace/verification";
import { PROPERTY_TYPE_LABELS, propertySizeLabel } from "@/lib/marketplace/presentation";

interface Props {
  property: Land;
  selected?: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
  cardRef?: (node: HTMLElement | null) => void;
}

export default function SearchPropertyCard({ property, selected, onSelect, onHover, cardRef }: Props) {
  const cover = property.images?.find((image) => image.is_cover) ?? property.images?.[0];
  const price = property.total_price;
  const priceLabel = "ราคารวม";
  const updatedLabel = formatUpdatedDate(property.updated_at);
  const badges = verificationBadges(property);
  const sizeLabel = propertySizeLabel(property);

  return (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        selected ? "border-[#00A859] ring-2 ring-[#00A859]/20" : "border-slate-200 hover:border-slate-300 hover:shadow-md"
      }`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="relative h-44 bg-slate-100 sm:h-auto sm:min-h-44">
            {cover ? (
              <Image src={cover.url_or_cdn_path} alt={cover.alt_th ?? property.title_th} fill sizes="(max-width: 640px) 100vw, 180px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                <Building2 size={34} />
              </div>
            )}
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              <span className="rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold text-slate-800 shadow-sm">
                {PROPERTY_TYPE_LABELS[property.property_type] ?? PROPERTY_TYPE_LABELS.other}
              </span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold text-white ${property.status === "sold" ? "bg-red-600" : "bg-emerald-600"}`}>
                {listingStatusLabel(property)}
              </span>
            </div>
          </div>

          <div className="min-w-0 p-3 min-[380px]:p-4">
            <h2 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 sm:text-base">{property.title_th}</h2>
            <div className="mt-3 space-y-1.5 text-xs text-slate-500">
              {(property.district || property.subdistrict || property.province?.name_th) && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="shrink-0" />
                  <span className="truncate">{[property.subdistrict, property.district, property.province?.name_th].filter(Boolean).join(" · ")}</span>
                </div>
              )}
              {sizeLabel && (
                <div className="flex items-center gap-1.5"><Ruler size={13} />{sizeLabel}</div>
              )}
              {property.zoning && (
                <div className="flex items-center gap-1.5"><Tag size={13} />{ZONING_LABELS[property.zoning]}</div>
              )}
            </div>
            {(property.frontage_m != null || property.road_width_m != null || property.is_eec || badges.length > 0 || (property.lat != null && property.lng != null)) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {property.frontage_m != null && (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">หน้ากว้าง {property.frontage_m.toLocaleString("th-TH")} ม.</span>
                )}
                {property.road_width_m != null && (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">ถนน {property.road_width_m.toLocaleString("th-TH")} ม.</span>
                )}
                {property.is_eec && (
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">EEC</span>
                )}
                {badges.map((badge) => (
                  <span key={badge} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">✓ {badge}</span>
                ))}
                {property.lat != null && property.lng != null && (
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${property.location_precision === "exact" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                    {property.location_precision === "exact" ? "พิกัดแบบ Exact" : "≈ ตำแหน่งโดยประมาณ"}
                  </span>
                )}
              </div>
            )}
            {(price != null || (property.transaction_type === "sale" && property.price_per_rai != null)) && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {price != null && (
                  <div>
                    <div className="text-[11px] text-slate-400">{priceLabel}</div>
                    <div className="text-sm font-black text-[#0d1f44]">{formatMoneyFull(price)}</div>
                  </div>
                )}
                {property.transaction_type === "sale" && property.price_per_rai != null && (
                  <div>
                    <div className="text-[11px] text-slate-400">ราคา / ไร่</div>
                    <div className="text-sm font-black text-[#0d1f44]">{formatMoneyFull(property.price_per_rai)}</div>
                  </div>
                )}
              </div>
            )}
            {updatedLabel && <div className="mt-2 text-[11px] text-slate-400">อัปเดต {updatedLabel}</div>}
            {property.verification_status === "pending" && (
              <div className="mt-2 text-[11px] font-medium text-amber-700">ข้อมูลกำลังตรวจสอบ</div>
            )}
          </div>
        </div>
      </button>
      <div className="border-t border-slate-100 px-3 py-2 text-right min-[380px]:px-4">
        <Link href={`/property/${property.slug}`} className="inline-flex min-h-11 items-center justify-end px-1 text-sm font-bold text-[#00A859] hover:underline">
          ดูรายละเอียดทรัพย์
        </Link>
      </div>
    </article>
  );
}
