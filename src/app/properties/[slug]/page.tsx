import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle,
  ExternalLink,
  MapPin,
  Ruler,
  Send,
  Tag,
} from "lucide-react";
import LeadForm from "@/components/forms/LeadForm";
import PropertyGallery from "@/components/properties/PropertyGallery";
import PropertyMap from "@/components/search/PropertyMap";
import LineButton from "@/components/ui/LineButton";
import { getListingBySlug } from "@/lib/neon/queries";
import { formatMoneyFull, formatRai, formatUpdatedDate, listingStatusLabel, ZONING_LABELS } from "@/lib/utils";
import type { Land } from "@/lib/types/database";
import { landVerification } from "@/lib/marketplace/verification";
import VerificationChecklist from "@/components/listings/VerificationChecklist";

export const revalidate = 60;
const getProperty = cache(getListingBySlug);

interface Params {
  slug: string;
}

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
  if (property.property_type === "factory") return "โรงงาน";
  if (property.property_type === "warehouse") return "โกดัง";
  return "ที่ดิน";
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug).catch(() => null);
  if (!property) return {};
  const location = locationLabel(property);
  return {
    title: property.seo_title ?? property.title_th,
    description:
      property.seo_description ??
      property.description ??
      `${property.title_th}${location ? ` ${location}` : ""}`,
    alternates: { canonical: `/properties/${slug}` },
    openGraph: {
      title: property.title_th,
      description: property.description ?? undefined,
      images: property.images?.[0]?.url_or_cdn_path
        ? [property.images[0].url_or_cdn_path]
        : undefined,
    },
  };
}

export default async function PropertyPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const property = await getProperty(slug).catch(() => null);
  if (!property) notFound();

  const isSoldOut = property.status === "sold";
  const cover = property.images?.find((image) => image.is_cover) ?? property.images?.[0];
  const area = legalArea(property);
  const location = locationLabel(property);
  const price = property.total_price;
  const updatedLabel = formatUpdatedDate(property.updated_at);
  const gallery = (property.images ?? []).map((image) => ({
    src: image.url_or_cdn_path,
    alt: image.alt_th ?? property.title_th,
  }));

  const facts = [
    area ? ["ขนาด", area] : null,
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
    property.frontage_m != null ? `หน้ากว้าง ${property.frontage_m.toLocaleString("th-TH")} เมตร` : null,
    property.road_width_m != null ? `ถนนกว้าง ${property.road_width_m.toLocaleString("th-TH")} เมตร` : null,
    property.is_eec ? "อยู่ในพื้นที่ EEC" : null,
  ].filter(Boolean) as string[];

  return (
    <main className="bg-white">
      <section className="relative overflow-hidden bg-[#071d4a] text-white">
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

            {(price != null || (!isSoldOut && property.referral_reward_max != null)) && (
              <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
                {price != null && (
                  <div className="rounded-2xl bg-white/95 px-4 py-4 text-[#071d4a] shadow-lg sm:px-5">
                    <div className="text-xs font-semibold text-slate-500">
                      ราคารวม
                    </div>
                    <div className="mt-1 text-xl font-black sm:text-2xl">{formatMoneyFull(price)}</div>
                  </div>
                )}
                {!isSoldOut && property.referral_reward_max != null && (
                  <div className="rounded-2xl border border-gold-400/60 bg-[#071d4a]/92 px-4 py-4 shadow-lg sm:px-5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
                      <BadgeDollarSign size={16} className="text-gold-400" /> ค่าแนะนำสูงสุด
                    </div>
                    <div className="mt-1 text-xl font-black text-gold-400 sm:text-2xl">
                      {formatMoneyFull(property.referral_reward_max)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-8">
            {gallery.length > 0 && (
              <section>
                <div className="mb-5 flex items-center gap-2">
                  <MapPin size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">รูปภาพและทำเล</h2>
                </div>
                <PropertyGallery images={gallery} title={property.title_th} />
              </section>
            )}

            {facts.length > 0 && (
              <section className="card p-4 sm:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Ruler size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">ข้อมูลทรัพย์</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {facts.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-4">
                      <div className="text-xs font-semibold text-slate-400">{label}</div>
                      <div className="wrap-break-word mt-1 font-bold text-slate-800">{value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="card p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle size={20} className="text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">สถานะการตรวจสอบข้อมูล</h2>
              </div>
              <VerificationChecklist dimensions={landVerification(property)} />
              <p className="mt-3 text-xs text-slate-500">แสดงเฉพาะสิ่งที่มีข้อมูลรองรับในระบบ หัวข้อที่ยังไม่ยืนยันควรตรวจสอบเพิ่มเติมก่อนตัดสินใจ</p>
            </section>

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

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              {isSoldOut ? (
                <>
                  <div className="bg-[#071d4a] p-5 text-white">
                    <div className="inline-flex rounded-md bg-red-600 px-3 py-1.5 text-sm font-black tracking-wide text-white">
                      Sold out
                    </div>
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
                    {area && (
                      <div className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="text-xs text-slate-400">ขนาดทรัพย์</div>
                        <div className="font-bold text-slate-800">{area}</div>
                      </div>
                    )}
                    <LineButton size="sm" label="สอบถามผ่าน LINE OA" className="w-full justify-center" />
                    <LeadForm listingId={property.id} compact defaultType="buyer" submitLabel="ขอข้อมูลทรัพย์นี้" />
                    <Link href="/contact" className="btn-outline w-full text-sm">
                      <CalendarDays size={16} /> นัดหมายเข้าชมพื้นที่
                    </Link>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

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
                    <LineButton size="sm" label="สอบถามผ่าน LINE OA" className="w-full justify-center min-[420px]:w-auto" />
                    <Link href="#inquiry" className="btn-white w-full min-[420px]:w-auto">
                      <Send size={16} /> ขอข้อมูลทรัพย์นี้
                    </Link>
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
