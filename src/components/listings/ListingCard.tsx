import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Ruler } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { propertySizeLabel } from "@/lib/marketplace/presentation";
import ListingTrust from "./ListingTrust";
import {
  LAND_TYPE_LABELS,
  ZONING_LABELS,
  formatMoney,
  formatMoneyFull,
  listingFacts,
  listingHref,
} from "@/lib/utils";

interface Props {
  land: Land;
  imageOverride?: {
    src: string;
    alt: string;
  };
  hrefOverride?: string;
  soldOut?: boolean;
  featured?: boolean;
  ctaLabel?: string;
  metaTagLabel?: string;
  rewardLabel?: string;
  pricePerRaiLabel?: string;
}

function exactAreaLabel(land: Land): string | null {
  const exactTotalRai = (land.area_rai ?? 0) + (land.area_ngan ?? 0) / 4 + (land.area_sqwa ?? 0) / 400;
  if (exactTotalRai > 0) {
    const parts: string[] = [];
    if ((land.area_rai ?? 0) > 0) parts.push(`${land.area_rai!.toLocaleString("th-TH")} ไร่`);
    if ((land.area_ngan ?? 0) > 0) parts.push(`${land.area_ngan!.toLocaleString("th-TH")} งาน`);
    if ((land.area_sqwa ?? 0) > 0) {
      parts.push(`${land.area_sqwa!.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ว.`);
    }
    if (parts.length > 0) return parts.join(" ");
  }
  return propertySizeLabel(land);
}
function propertyTypeLabel(land: Land): string {
  // Land keeps its legacy category label (e.g. ที่ดินอุตสาหกรรม); other assets use the property type label.
  if (land.property_type && land.property_type !== "land") return LAND_TYPE_LABELS[land.property_type] ?? LAND_TYPE_LABELS.other;
  return LAND_TYPE_LABELS[land.land_type] ?? LAND_TYPE_LABELS.other;
}

function locationLabel(land: Land): string | null {
  const values = [land.subdistrict, land.district, land.province?.name_th].filter(Boolean) as string[];
  if (values.length === 0) return null;
  return values.filter((value, index) => values.findIndex((other) => other === value) === index).join(" · ");
}

export default function ListingCard({
  land,
  imageOverride,
  hrefOverride,
  soldOut,
  featured,
  ctaLabel = "ดูรายละเอียดแปลง",
  metaTagLabel,
  rewardLabel,
  pricePerRaiLabel,
}: Props) {
  const isSoldOut = soldOut ?? land.status === "sold";
  const coverImage = land.images?.find((img) => img.is_cover) ?? land.images?.[0];
  const image = imageOverride ?? (coverImage
    ? {
        src: coverImage.url_or_cdn_path,
        alt: coverImage.alt_th ?? land.title_th,
      }
    : null);
  const href = hrefOverride ?? listingHref(land.public_ref, land.slug);
  const area = exactAreaLabel(land);
  const location = locationLabel(land);
  const typeLabel = propertyTypeLabel(land);
  const zoningLabel = metaTagLabel ?? (land.zoning ? ZONING_LABELS[land.zoning] : null);
  const totalPrice = land.total_price;
  const perRaiText = pricePerRaiLabel ?? (land.price_per_rai != null ? `฿${formatMoney(land.price_per_rai)}` : null);
  // Override labels (seed presentation) win over stored zoning; fall back to the type when there is no zoning.
  const facts = listingFacts({ ...land, zoning: null }, area);
  facts.splice(area ? 1 : 0, 0, zoningLabel ?? typeLabel);

  return (
    <article
      className={`card-ref group flex min-w-0 flex-col${
        featured ? " ring-2 ring-[#00A859]/60 shadow-[0_8px_28px_rgba(0,168,89,0.14)]" : ""
      }`}
    >
      <Link href={href} className="block">
        <div className="relative h-44 overflow-hidden bg-slate-100 sm:h-48">
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <Ruler size={40} />
            </div>
          )}

          <div className="absolute left-3 top-3 z-10 flex max-w-[72%] flex-wrap gap-1.5">
            {land.province?.name_th && (
              <span className="rounded-md bg-[#00A859] px-3 py-1 text-sm font-bold text-white shadow-sm">
                {land.province.name_th}
              </span>
            )}
            <span className="rounded-md bg-[#071d4a]/90 px-2.5 py-1 text-sm font-bold text-white shadow-sm backdrop-blur-sm">
              {typeLabel} · ขาย
            </span>
          </div>


          {land.status === "reserved" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
                จองแล้ว
              </span>
            </div>
          )}


          {!isSoldOut && land.referral_reward_max != null && (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-[#001B48]/92 px-4 py-2.5">
              <div className="text-sm font-medium text-white/85">
                {rewardLabel ?? "ค่าตอบแทนผู้แนะนำสูงสุด"}
              </div>
              <div className="text-lg font-black leading-tight text-gold-400 sm:text-xl">
                {formatMoneyFull(land.referral_reward_max)}
              </div>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 pb-5">
        <Link href={href} className="flex-1">
          {totalPrice != null ? (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-black text-[#0a2a63]" title={formatMoneyFull(totalPrice)}>฿{totalPrice.toLocaleString("th-TH")}</span>
              {perRaiText && <span className="text-sm text-slate-500">{perRaiText} / ไร่</span>}
            </div>
          ) : (
            <div className="text-lg font-black text-[#0a2a63]">สอบถามราคา</div>
          )}
          <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug text-slate-900">
            {land.verification_status === "verified" && (
              <BadgeCheck size={17} className="mr-1 inline align-[-3px] text-[#00A859]" aria-label="ทีมงานตรวจสอบประกาศแล้ว" />
            )}
            {land.title_th}
          </h3>
          {location && <p className="mt-1 text-sm text-slate-500">{location}</p>}
          {facts.length > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              {facts.map((fact, index) => (
                <span key={fact} className="whitespace-nowrap">{index > 0 && <span className="mx-1.5 text-slate-300">|</span>}{fact} </span>
              ))}
            </p>
          )}
          {land.verification_status === "pending" && (
            <p className="mt-1 text-xs font-medium text-amber-700">ข้อมูลกำลังตรวจสอบ</p>
          )}
        </Link>
        <ListingTrust land={land} className="mt-3" />

        <Link
          href={href}
          className={`mt-3 min-h-11 w-full justify-center px-3 py-2.5 text-sm ${isSoldOut ? "btn-outline" : "btn-green"}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
