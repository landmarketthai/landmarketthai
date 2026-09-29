import Link from "next/link";
import Image from "next/image";
import { MapPin, Ruler, Tag } from "lucide-react";
import type { Land } from "@/lib/types/database";
import {
  LAND_TYPE_LABELS,
  ZONING_LABELS,
  formatRai,
  formatMoney,
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

          {land.province?.name_th && (
            <span className="absolute left-3 top-3 z-10 rounded-md bg-[#00A859] px-3 py-1 text-xs font-bold text-white shadow-sm">
              {land.province.name_th}
            </span>
          )}

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

          {!isSoldOut && land.referral_reward_max ? (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-[#001B48]/92 px-4 py-2.5">
              <div className="text-[11px] font-medium text-white/85">
                {rewardLabel ?? "ค่าคอมสูงสุด"}
              </div>
              <div className="text-xl font-black leading-tight text-gold-400">
                {formatMoney(land.referral_reward_max)} บาท
              </div>
            </div>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 pb-5">
        <Link href={href} className="flex-1">
          <h3 className="mb-3 line-clamp-2 text-base font-semibold leading-snug text-slate-800">
            {land.title_th}
          </h3>

          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-2 border-y border-slate-100 py-3 text-xs text-slate-500">
            <span className="flex min-w-0 items-center gap-1">
              <Ruler size={13} />
              {formatRai(land.size_rai)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={13} />
              <span className="truncate">{land.district ?? land.province?.name_th ?? ""}</span>
            </span>
            {metaTagLabel ? (
              <span className="flex min-w-0 items-center gap-1">
                <Tag size={13} />
                <span className="truncate">{metaTagLabel}</span>
              </span>
            ) : land.zoning ? (
              <span className="flex min-w-0 items-center gap-1">
                <Tag size={13} />
                <span className="truncate">{ZONING_LABELS[land.zoning]}</span>
              </span>
            ) : (
              <span>{LAND_TYPE_LABELS[land.land_type]}</span>
            )}
          </div>
        </Link>

        <div className="mt-auto flex flex-col gap-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">ราคา/ไร่</div>
            <div className="text-sm font-bold text-gold-500">
              {pricePerRaiLabel ?? `${formatMoney(land.price_per_rai)} ฿`}
            </div>
          </div>
          <Link
            href={href}
            className={`w-full shrink-0 px-3 py-2 text-xs min-[360px]:w-auto ${
              isSoldOut ? "btn-outline" : "btn-green"
            }`}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
