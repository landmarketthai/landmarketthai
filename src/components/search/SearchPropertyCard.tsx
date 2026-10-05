"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Building2, Camera } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { formatMoney, formatUpdatedDate, listingFacts, listingStatusLabel } from "@/lib/utils";
import { verificationBadges } from "@/lib/marketplace/verification";
import { PROPERTY_TYPE_LABELS, propertySizeLabel } from "@/lib/marketplace/presentation";

interface Props {
  property: Land;
  selected?: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
  cardRef?: (node: HTMLElement | null) => void;
}

/** Price first, then what it is, then where — one quiet fact line instead of a row of chips. */
export default function SearchPropertyCard({ property, selected, onSelect, onHover, cardRef }: Props) {
  const cover = property.images?.find((image) => image.is_cover) ?? property.images?.[0];
  const photoCount = property.images?.length ?? 0;
  const price = property.total_price;
  const perRai = property.transaction_type === "sale" ? property.price_per_rai : null;
  const updatedLabel = formatUpdatedDate(property.updated_at);
  const badges = verificationBadges(property);
  const facts = listingFacts(property, propertySizeLabel(property));
  const location = [property.subdistrict, property.district, property.province?.name_th].filter(Boolean).join(", ");

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
        <div className="grid sm:grid-cols-[200px_minmax(0,1fr)]">
          <div className="relative h-52 bg-slate-100 sm:h-auto sm:min-h-48">
            {cover ? (
              <Image src={cover.url_or_cdn_path} alt={cover.alt_th ?? property.title_th} fill sizes="(max-width: 640px) 100vw, 200px" className="object-cover" />
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
            {photoCount > 1 && (
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                <Camera size={12} /> {photoCount}
              </span>
            )}
          </div>

          <div className="min-w-0 p-4">
            {price != null ? (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xl font-black text-[#0d1f44]">฿{price.toLocaleString("th-TH")}</span>
                {perRai != null && <span className="text-sm text-slate-500">฿{formatMoney(perRai)} / ไร่</span>}
              </div>
            ) : (
              <div className="text-lg font-black text-[#0d1f44]">สอบถามราคา</div>
            )}
            <h2 className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">
              {badges.length > 0 && (
                <BadgeCheck size={16} className="mr-1 inline align-[-3px] text-[#00A859]" aria-label={badges.join(" · ")} />
              )}
              {property.title_th}
            </h2>
            {location && <p className="mt-1 truncate text-sm text-slate-500">{location}</p>}
            {facts.length > 0 && (
              <p className="mt-2 text-sm text-slate-700">
                {facts.map((fact, index) => (
                  <span key={fact}>{index > 0 && <span className="mx-1.5 text-slate-300">| </span>}<span className="whitespace-nowrap">{fact}</span></span>
                ))}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              {[
                updatedLabel && `อัปเดต ${updatedLabel}`,
                property.lat != null && property.location_precision !== "exact" ? "ตำแหน่งโดยประมาณ" : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {property.verification_status === "pending" && (
              <p className="mt-1 text-xs font-medium text-amber-700">ข้อมูลกำลังตรวจสอบ</p>
            )}
          </div>
        </div>
      </button>
      <div className="border-t border-slate-100 px-4 py-1 text-right">
        <Link href={`/property/${property.slug}`} className="inline-flex min-h-11 items-center justify-end px-1 text-sm font-bold text-[#00A859] hover:underline">
          ดูรายละเอียดทรัพย์
        </Link>
      </div>
    </article>
  );
}
