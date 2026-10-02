import Link from "next/link";
import Image from "next/image";
import { MapPin, Ruler, Tag, MoveHorizontal, Building2 } from "lucide-react";
import type { Land } from "@/lib/types/database";
import ListingTrust from "./ListingTrust";
import VerificationBadges from "./VerificationBadges";
import {
  LAND_TYPE_LABELS,
  ZONING_LABELS,
  formatMoney,
  formatMoneyFull,
  formatUpdatedDate,
  listingHref,
  listingStatusLabel,
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
  if (land.area_rai != null || land.area_ngan != null || land.area_sqwa != null) {
    const parts: string[] = [];
    if (land.area_rai != null) parts.push(`${land.area_rai.toLocaleString("th-TH")} ไร่`);
    if (land.area_ngan != null) parts.push(`${land.area_ngan.toLocaleString("th-TH")} งาน`);
    if (land.area_sqwa != null) {
      parts.push(`${land.area_sqwa.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ว.`);
    }
    if (parts.length > 0) return parts.join(" ");
  }
  if (land.size_rai == null) {
    return land.usable_area_sqm != null ? `${land.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.` : null;
  }

  const wholeRai = Math.floor(land.size_rai);
  const remainingSqwa = Math.round((land.size_rai - wholeRai) * 400 * 100) / 100;
  let ngan = Math.floor(remainingSqwa / 100);
  let sqwa = Math.round((remainingSqwa - ngan * 100) * 100) / 100;

  if (sqwa >= 100) {
    ngan += 1;
    sqwa = 0;
  }
  if (ngan >= 4) {
    return `${wholeRai + 1} ไร่`;
  }

  const parts = [`${wholeRai.toLocaleString("th-TH")} ไร่`];
  if (ngan > 0) parts.push(`${ngan} งาน`);
  if (sqwa > 0) parts.push(`${sqwa.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ว.`);
  return parts.join(" ");
}

function propertyTypeLabel(land: Land): string {
  // Land keeps its legacy category label (e.g. ที่ดินอุตสาหกรรม); other assets use the property type label.
  if (land.property_type && land.property_type !== "land") return LAND_TYPE_LABELS[land.property_type] ?? "ที่ดิน";
  return LAND_TYPE_LABELS[land.land_type] ?? "ที่ดิน";
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
  const totalPriceLabel = "ราคารวม";
  const updatedLabel = formatUpdatedDate(land.updated_at);

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
              <span className="rounded-md bg-[#00A859] px-3 py-1 text-xs font-bold text-white shadow-sm">
                {land.province.name_th}
              </span>
            )}
            <span className="rounded-md bg-[#071d4a]/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm">
              {typeLabel} · ขาย
            </span>
          </div>

          {featured && !isSoldOut && (
            <span className="absolute right-3 top-3 z-10 rounded-md bg-gold-400 px-2.5 py-1 text-[11px] font-black text-[#001B48] shadow-sm">
              เปิดรับแนะนำ
            </span>
          )}

          {land.status === "reserved" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
                จองแล้ว
              </span>
            </div>
          )}

          {isSoldOut && (
            <span className="absolute right-3 top-3 z-20 rounded-md bg-red-600 px-3 py-1.5 text-xs font-black tracking-wide text-white shadow-lg">
              Sold out
            </span>
          )}

          {!isSoldOut && land.referral_reward_max != null && (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-[#001B48]/92 px-4 py-2.5">
              <div className="text-[11px] font-medium text-white/85">
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
        <ListingTrust land={land} className="mb-3" />
        <VerificationBadges land={land} />
        <Link href={href} className="flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-800">
            {land.title_th}
          </h3>

          <div className="mt-3 grid gap-2 border-y border-slate-100 py-3 text-xs text-slate-600">
            {area && (
              <div className="flex min-w-0 items-start gap-1.5">
                <Ruler size={13} className="mt-0.5 shrink-0 text-brand-600" />
                <span className="min-w-0 font-semibold text-slate-700">{area}</span>
              </div>
            )}
            {location && (
              <div className="flex min-w-0 items-start gap-1.5">
                <MapPin size={13} className="mt-0.5 shrink-0 text-brand-600" />
                <span className="min-w-0 break-words">{location}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {zoningLabel ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Tag size={13} className="shrink-0 text-brand-600" />
                  <span>{zoningLabel}</span>
                </span>
              ) : (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Building2 size={13} className="shrink-0 text-brand-600" />
                  <span>{typeLabel}</span>
                </span>
              )}
              {land.is_eec && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">EEC</span>
              )}
              {land.frontage_m != null && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <MoveHorizontal size={13} className="shrink-0 text-brand-600" />
                  <span>หน้ากว้าง {land.frontage_m.toLocaleString("th-TH")} ม.</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${isSoldOut ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {listingStatusLabel(land)}
              </span>
              {updatedLabel && <span className="text-[11px] text-slate-400">อัปเดต {updatedLabel}</span>}
            </div>
            {land.verification_status === "pending" && (
              <span className="w-fit rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                ข้อมูลกำลังตรวจสอบ
              </span>
            )}
          </div>
        </Link>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {(pricePerRaiLabel || land.price_per_rai != null) && (
            <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">ราคา / ไร่</div>
              <div className="mt-0.5 truncate text-sm font-black text-[#0a2a63]">
                {pricePerRaiLabel ?? `${formatMoney(land.price_per_rai as number)} ฿`}
              </div>
            </div>
          )}
          {totalPrice != null && (
            <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">{totalPriceLabel}</div>
              <div className="mt-0.5 truncate text-sm font-black text-[#0a2a63]" title={formatMoneyFull(totalPrice)}>
                {formatMoney(totalPrice)} ฿
              </div>
            </div>
          )}
        </div>

        {totalPrice != null && (
          <div className="mt-1 text-right text-[10px] text-slate-400">
            {totalPriceLabel}: {formatMoneyFull(totalPrice)}
          </div>
        )}

        <Link
          href={href}
          className={`mt-3 w-full justify-center px-3 py-2.5 text-xs ${isSoldOut ? "btn-outline" : "btn-green"}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
