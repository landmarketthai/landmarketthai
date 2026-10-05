import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  MapPin,
  Ruler,
  Send,
  Tag,
} from "lucide-react";
import LeadForm from "@/components/forms/LeadForm";
import PropertyGallery from "@/components/properties/PropertyGallery";
import PropertyMobileActions from "@/components/properties/PropertyMobileActions";
import PropertyMap from "@/components/search/PropertyMap";
import LineButton from "@/components/ui/LineButton";
import { formatMoneyFull, formatRai, formatUpdatedDate, listingStatusLabel, ZONING_LABELS } from "@/lib/utils";
import type { Land } from "@/lib/types/database";
import { PROPERTY_TYPE_LABELS } from "@/lib/marketplace/presentation";
import { PropertyIntelligence } from "@/components/intelligence/PropertyIntelligence";
import ListingCard from "@/components/listings/ListingCard";
import { rankSimilarProperties } from "@/lib/similar-properties";
import { resolveListingPresentation } from "@/lib/seed-listings";
import VerificationSummary from "@/components/listings/VerificationSummary";
import ReferralCallout from "@/components/properties/ReferralCallout";

function legalArea(property: Land): string | null {
  if (property.area_rai != null || property.area_ngan != null || property.area_sqwa != null) {
    const parts: string[] = [];
    if (property.area_rai != null) parts.push(`${property.area_rai} ไร่`);
    if (property.area_ngan != null) parts.push(`${property.area_ngan} งาน`);
    if (property.area_sqwa != null) {
      parts.push(`${property.area_sqwa.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ว.`);
    }
    return parts.join(" ");
  }
  return property.size_rai != null ? formatRai(property.size_rai) : null;
}

function locationLabel(property: Land): string {
  return [property.subdistrict, property.district, property.province?.name_th].filter(Boolean).join(" · ");
}

function propertyTypeLabel(property: Land): string {
  return PROPERTY_TYPE_LABELS[property.property_type] ?? PROPERTY_TYPE_LABELS.other;
}

function usableArea(property: Land): string | null {
  return property.usable_area_sqm != null && property.usable_area_sqm > 0
    ? `${property.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.`
    : null;
}

export default async function DynamicPropertyDetail({ property, inventory }: { property: Land; inventory: Land[] | null }) {
  const similar = rankSimilarProperties(property, inventory ?? []);

  const isSoldOut = property.status === "sold";
  const cover = property.images?.find((image) => image.is_cover) ?? property.images?.[0];
  const area = legalArea(property);
  const usable = usableArea(property);
  const location = locationLabel(property);
  const price = property.total_price;
  const referralReward = isSoldOut ? null : property.referral_reward_max;
  const updatedLabel = formatUpdatedDate(property.updated_at);
  const gallery = (property.images ?? []).map((image) => ({
    src: image.url_or_cdn_path,
    alt: image.alt_th ?? property.title_th,
  }));
  const mobileGallery = gallery.filter((image) => image.src !== cover?.url_or_cdn_path);

  const facts = [
    area ? ["ขนาด", area] : null,
    usable ? ["พื้นที่ใช้สอย", usable] : null,
    property.total_price != null ? ["ราคารวม", formatMoneyFull(property.total_price)] : null,
    property.price_per_rai != null ? ["ราคา / ไร่", formatMoneyFull(property.price_per_rai)] : null,
    property.zoning ? ["ผังเมือง", ZONING_LABELS[property.zoning]] : null,
    property.is_eec ? ["เขตเศรษฐกิจ", "พื้นที่ EEC"] : null,
    property.frontage_m != null ? ["หน้ากว้าง", `${property.frontage_m.toLocaleString("th-TH")} เมตร`] : null,
    property.depth_min_m != null && property.depth_max_m != null
      ? ["ความลึก", `${property.depth_min_m.toLocaleString("th-TH")}–${property.depth_max_m.toLocaleString("th-TH")} เมตร`]
      : property.depth_min_m != null
        ? ["ความลึก", `${property.depth_min_m.toLocaleString("th-TH")} เมตร`]
        : null,
    property.road_name ? ["ถนน", property.road_name] : null,
    property.road_width_m != null ? ["ความกว้างถนน", `${property.road_width_m.toLocaleString("th-TH")} เมตร`] : null,
    property.lat != null && property.lng != null
      ? ["พิกัด", property.location_precision === "exact" ? "พิกัดแบบ Exact" : "ตำแหน่งโดยประมาณ"]
      : null,
    updatedLabel ? ["อัปเดตล่าสุด", updatedLabel] : null,
  ].filter(Boolean) as [string, string][];

  const heroHighlights = [
    area ? `ขนาด ${area}` : null,
    usable ? `พื้นที่ใช้สอย ${usable}` : null,
    property.frontage_m != null ? `หน้ากว้าง ${property.frontage_m.toLocaleString("th-TH")} เมตร` : null,
    property.road_width_m != null ? `ถนนกว้าง ${property.road_width_m.toLocaleString("th-TH")} เมตร` : null,
    property.is_eec ? "อยู่ในพื้นที่ EEC" : null,
  ].filter(Boolean) as string[];

  return (
    <main className="bg-white pb-20 md:pb-0">
      <section className="relative hidden overflow-hidden bg-[#071d4a] text-white md:block">
        {cover && (
          <Image
            src={cover.url_or_cdn_path}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-55"
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-r from-[#071d4a]/95 via-[#071d4a]/78 to-[#071d4a]/35" />

        <div className="container-xl relative px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <Link
              href="/search"
              className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-100 hover:text-white"
            >
              ค้นหาทรัพย์ <ArrowRight size={14} /> รายละเอียด
            </Link>

            <div className="mb-4 flex flex-wrap gap-2">
              {property.province?.name_th && (
                <span className="rounded-full bg-[#00A859] px-3 py-1 text-xs font-bold text-white">
                  {property.province.name_th}
                </span>
              )}
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                {propertyTypeLabel(property)} · ขาย
              </span>
              {property.zoning && (
                <span className="rounded-full bg-purple-500/90 px-3 py-1 text-xs font-bold text-white">
                  {ZONING_LABELS[property.zoning]}
                </span>
              )}
              <span className={`rounded-full px-3 py-1 text-xs font-black tracking-wide text-white shadow-sm ${isSoldOut ? "bg-red-600" : "bg-emerald-600"}`}>
                {listingStatusLabel(property)}
              </span>
              {property.verification_status === "pending" && (
                <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">
                  ข้อมูลกำลังตรวจสอบ
                </span>
              )}
            </div>

            <h1 className="text-[1.85rem] font-black leading-tight sm:text-4xl lg:text-5xl">
              {property.title_th}
            </h1>

            {location && (
              <div className="mt-3 flex min-w-0 items-start gap-2 text-sm text-blue-100 sm:text-base">
                <MapPin size={17} className="mt-0.5 shrink-0" />
                <span className="break-words">{location}</span>
              </div>
            )}

            {heroHighlights.length > 0 && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {heroHighlights.map((highlight) => (
                  <div key={highlight} className="flex items-center gap-2 text-sm text-blue-50">
                    <CheckCircle size={17} className="shrink-0 text-gold-400" />
                    {highlight}
                  </div>
                ))}
              </div>
            )}

            {(price != null || referralReward != null) && (
              <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                {price != null && (
                  <div className="rounded-2xl bg-white/95 px-4 py-4 text-[#071d4a] shadow-lg sm:px-5">
                    <div className="text-xs font-semibold text-slate-500">
                      ราคารวม
                    </div>
                    <div className="mt-1 text-xl font-black sm:text-2xl">{formatMoneyFull(price)}</div>
                  </div>
                )}
                {property.price_per_rai != null && (
                  <div className="rounded-2xl bg-white/95 px-4 py-4 text-[#071d4a] shadow-lg sm:px-5">
                    <div className="text-xs font-semibold text-slate-500">ราคา / ไร่</div>
                    <div className="mt-1 text-xl font-black sm:text-2xl">{formatMoneyFull(property.price_per_rai)}</div>
                  </div>
                )}
                {referralReward != null && <ReferralCallout reward={referralReward} variant="hero" />}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 pb-5 pt-3 md:hidden">
        <div className="mx-auto max-w-lg">
          {cover ? (
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-100">
              <Image src={cover.url_or_cdn_path} alt={cover.alt_th ?? property.title_th} fill priority sizes="100vw" className="object-cover" />
            </div>
          ) : null}
          <div className="pt-4">
            <div className="flex flex-wrap gap-2">
              {property.province?.name_th && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">{property.province.name_th}</span>}
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">{propertyTypeLabel(property)}</span>
              {isSoldOut && <span className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700">ขายแล้ว</span>}
            </div>
            <h1 className="mt-3 text-2xl font-black leading-tight text-slate-950">{property.title_th}</h1>
            {location && <p className="mt-2 flex items-start gap-2 text-sm text-slate-600"><MapPin size={17} className="mt-0.5 shrink-0" />{location}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(area || usable) && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-sm text-slate-500">{area ? "ขนาด" : "พื้นที่ใช้สอย"}</div>
                  <div className="mt-1 text-sm font-bold leading-snug text-slate-900">{area ?? usable}</div>
                </div>
              )}
              {property.price_per_rai != null && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-sm text-slate-500">ราคา / ไร่</div>
                  <div className="mt-1 text-sm font-bold text-brand-900">{formatMoneyFull(property.price_per_rai)}</div>
                </div>
              )}
              {price != null && (
                <div className="col-span-2 rounded-xl bg-brand-50 p-3">
                  <div className="text-sm text-slate-500">{isSoldOut ? "ราคารวมเดิม" : "ราคารวม"}</div>
                  <div className="mt-1 text-xl font-black text-brand-900">{formatMoneyFull(price)}</div>
                </div>
              )}
              {referralReward != null && <ReferralCallout reward={referralReward} variant="mobile" />}
            </div>
            <div className="mt-4">
              <VerificationSummary land={property} />
            </div>
            <PropertyMobileActions listingId={property.id} listingRef={property.public_ref} listingTitle={property.title_th} soldOut={isSoldOut} referralReward={referralReward} />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-8">
            {gallery.length > 0 && (
              <section>
                <div className="mb-5 flex items-center gap-2">
                  <MapPin size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">รูปภาพเพิ่มเติม</h2>
                </div>
                <div className="md:hidden">
                  {mobileGallery.length > 0 ? (
                    <PropertyGallery images={mobileGallery} title={property.title_th} />
                  ) : (
                    <p className="text-sm text-slate-500">ไม่มีรูปเพิ่มเติม</p>
                  )}
                </div>
                <div className="hidden md:block">
                  <PropertyGallery images={gallery} title={property.title_th} />
                </div>
              </section>
            )}

            {facts.length > 0 && (
              <section className="card p-4 sm:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Ruler size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">ข้อมูลทรัพย์</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
                  {facts.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-500">{label}</div>
                      <div className="wrap-break-word mt-1 font-bold text-slate-800">{value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="hidden md:block"><VerificationSummary land={property} /></div>

            {inventory ? <PropertyIntelligence land={property} inventory={inventory} /> : <p role="alert">ข้อมูลประกาศเปรียบเทียบไม่พร้อมใช้งานชั่วคราว</p>}

            {property.description && (
              <section className="card p-4 sm:p-6">
                <h2 className="text-xl font-bold text-slate-900">รายละเอียดเพิ่มเติม</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{property.description}</p>
              </section>
            )}

            {property.nearby_landmarks && property.nearby_landmarks.length > 0 && (
              <section className="card p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Tag size={19} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">ข้อมูลทำเลที่บันทึกไว้</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {property.nearby_landmarks.map((item) => (
                    <span key={item} className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {property.lat != null && property.lng != null && (
              <section>
                <div className="mb-5 flex items-center gap-2">
                  <MapPin size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">พิกัดและทำเลที่ตั้ง</h2>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <PropertyMap properties={[property]} interactive={false} className="h-[300px] sm:h-[420px]" />
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${property.lat},${property.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline mt-4 inline-flex text-sm"
                >
                  <ExternalLink size={15} /> เปิดใน Google Maps
                </a>
              </section>
            )}
          </div>

          <aside className="hidden min-w-0 md:block lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              {isSoldOut ? (
                <>
                  <div className="bg-[#071d4a] p-5 text-white">
                    <p className="mt-3 text-sm leading-relaxed text-blue-50">
                      ทรัพย์นี้ปิดการขายแล้ว และไม่ได้เปิดรับข้อเสนอหรือผู้แนะนำเพิ่มเติม
                    </p>
                  </div>
                  <div className="space-y-3 p-4 sm:p-5">
                    {area && (
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">ขนาดทรัพย์</div>
                        <div className="wrap-break-word font-bold text-slate-800">{area}</div>
                      </div>
                    )}
                    <Link href="/search" className="btn-green w-full text-sm">ดูทรัพย์ที่ยังเปิดอยู่</Link>
                    <Link href="/buy-request" className="btn-outline w-full text-sm">ฝากเงื่อนไขให้ทีมช่วยหา</Link>
                    <LineButton size="sm" label="สอบถามทรัพย์ใกล้เคียง" className="w-full justify-center" />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#071d4a] p-5 text-white">
                    <div className="text-sm font-semibold text-blue-100">สนใจทรัพย์นี้?</div>
                    <p className="mt-2 text-sm leading-relaxed text-blue-50">
                      ฝากเบอร์โทรหรือเพิ่ม LINE OA เพื่อรับข้อมูลที่มีอยู่และนัดหมายกับทีมงาน
                    </p>
                  </div>
                  <div className="space-y-4 p-4 sm:p-5" id="inquiry">
                    <LeadForm listingId={property.id} compact defaultType="buyer" submitLabel="ขอข้อมูลทรัพย์นี้" />
                    <LineButton size="sm" label="หรือทัก LINE OA" className="w-full justify-center" />
                  </div>
                  {referralReward != null && <ReferralCallout reward={referralReward} variant="sidebar" />}
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      {similar.length > 0 && <section className="container-xl section">
        <h2 className="mb-6 text-xl font-bold">ทรัพย์ใกล้เคียงที่ยังเปิดขาย</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{similar.map(item => <ListingCard key={item.id} land={item} {...resolveListingPresentation(item)} publicBuyerMode />)}</div>
      </section>}

      <section className="px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl">
          <div className="relative overflow-hidden rounded-[26px] bg-[#071d4a] p-5 text-white shadow-[0_14px_36px_rgba(13,30,70,0.10)] sm:p-7 lg:p-9">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#00A859]/20" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-xl font-black sm:text-2xl">
                  {isSoldOut ? "แปลงนี้ปิดการขายเรียบร้อยแล้ว" : "ต้องการข้อมูลเพิ่มเติมหรือนัดชมพื้นที่?"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">
                  {isSoldOut
                    ? "ดูทรัพย์ที่ยังเปิดอยู่ หรือฝากเงื่อนไขเพื่อให้ทีม LandmarketThai ช่วยหาทรัพย์ใกล้เคียง"
                    : "ติดต่อทีม LandmarketThai เพื่อรับข้อมูลที่มีอยู่ เอกสาร หรือประสานนัดเข้าชมพื้นที่"}
                </p>
              </div>
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap lg:justify-end">
                {isSoldOut ? (
                  <>
                    <Link href="/search" className="btn-white w-full min-[420px]:w-auto">ดูทรัพย์ที่เปิดอยู่</Link>
                    <Link href="/buy-request" className="btn-green w-full min-[420px]:w-auto">ฝากซื้อ</Link>
                  </>
                ) : (
                  <>
                    <Link href="#inquiry" className="btn-green hidden w-full min-[420px]:w-auto md:inline-flex">
                      <Send size={16} /> ขอข้อมูลทรัพย์นี้
                    </Link>
                    <LineButton size="sm" label="ทัก LINE OA" className="w-full justify-center min-[420px]:w-auto" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
