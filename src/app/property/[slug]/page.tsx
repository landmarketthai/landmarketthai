import type { Metadata } from "next";
import { cache } from "react";
import ZoningBadges from "@/components/listings/ZoningBadges";
import DynamicPropertyDetail from "@/components/properties/DynamicPropertyDetail";
import { listingMetadata } from "@/lib/public-seo";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Factory,
  MapPin,
  Ruler,
  Send,
  ShieldCheck,
  Truck,
  Video,
} from "lucide-react";
import LeadForm from "@/components/forms/LeadForm";
import PropertyGallery from "@/components/properties/PropertyGallery";
import PropertyMobileActions from "@/components/properties/PropertyMobileActions";
import PropertyVideos from "@/components/properties/PropertyVideos";
import LineButton from "@/components/ui/LineButton";
import ListingCard from "@/components/listings/ListingCard";
import VerificationSummary from "@/components/listings/VerificationSummary";
import ReferralCallout from "@/components/properties/ReferralCallout";
import { PropertyIntelligence } from "@/components/intelligence/PropertyIntelligence";
import { getPublicInventory } from "@/lib/public-inventory";
import { getListingBySlug } from "@/lib/neon/queries";
import { SEED_PUBLIC_LISTINGS, resolveListingPresentation } from "@/lib/seed-listings";
import { rankSimilarProperties } from "@/lib/similar-properties";
import { formatMoneyFull } from "@/lib/utils";
import {
  getPropertyDetail,
  propertyDetails,
} from "@/lib/property-detail-data";

interface Params {
  slug: string;
}

const readInventory = cache(() => getPublicInventory().catch(() => SEED_PUBLIC_LISTINGS));
const readListing = cache(getListingBySlug);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const land = await readListing(slug);
  if (!land) return {
    title: { absolute: "ไม่พบประกาศ" },
    description: null,
    alternates: { canonical: null },
    openGraph: null,
    robots: { index: false, follow: true },
  };
  return listingMetadata(land);
}

const highlightIcons = [Factory, Truck, ShieldCheck];
export const revalidate = 60;

export function generateStaticParams() {
  return propertyDetails.map((property) => ({ slug: property.slug }));
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const [land, inventory] = await Promise.all([readListing(slug), readInventory()]);
  if (!land) notFound();
  const property = getPropertyDetail(slug);
  if (!property) return <DynamicPropertyDetail property={land} inventory={inventory} />;
  const isSoldOut = land.status === "sold";
  const similar = land ? rankSimilarProperties(land, inventory ?? []) : [];
  const mobileGallery = property.gallery.filter((image) => image.src !== property.heroImage.src);
  const totalPriceLabel = property.facts.find((fact) => fact.label === "ราคารวม")?.value
    ?? (land.total_price != null ? formatMoneyFull(land.total_price) : null);
  const referralReward = isSoldOut ? null : land.referral_reward_max;

  return (
    <main className="bg-white pb-20 md:pb-0">
      <section className="relative hidden overflow-hidden bg-slate-950 text-white md:block">
        <div className="absolute inset-0">
          <Image
            src={property.heroImage.src}
            alt={property.heroImage.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-linear-to-r from-[#071d4a]/95 via-[#071d4a]/72 to-[#071d4a]/20" />
        </div>

        <div className="container-xl relative px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Link
              href="/"
              className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-100 hover:text-white"
            >
              หน้าแรก
              <ArrowRight size={14} />
              ที่ดินแนะนำ
            </Link>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#00A859] px-3 py-1 text-xs font-bold text-white">
                {property.location}
              </span>
              <ZoningBadges land={land} />
              {isSoldOut && (
                <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black tracking-wide text-white shadow-sm">
                  ขายแล้ว
                </span>
              )}
            </div>

            <h1 className="text-[2rem] font-black leading-tight sm:text-4xl lg:text-5xl">
              {property.title}
            </h1>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {property.keyHighlights.map((highlight) => (
                <div key={highlight} className="flex items-center gap-2 text-sm text-blue-50">
                  <CheckCircle size={17} className="shrink-0 text-gold-400" />
                  {highlight}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <div className="rounded-2xl bg-white/95 px-4 py-4 text-[#071d4a] shadow-lg sm:px-5">
                <div className="text-xs font-semibold text-slate-500">ราคา/ไร่</div>
                <div className="mt-1 text-xl font-black sm:text-2xl">{property.pricePerRai}</div>
              </div>
              {totalPriceLabel && (
                <div className="rounded-2xl bg-white/95 px-4 py-4 text-[#071d4a] shadow-lg sm:px-5">
                  <div className="text-xs font-semibold text-slate-500">ราคารวม</div>
                  <div className="mt-1 text-xl font-black sm:text-2xl">{totalPriceLabel}</div>
                </div>
              )}
              {referralReward != null && <ReferralCallout reward={referralReward} variant="hero" />}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 pb-5 pt-3 md:hidden">
        <div className="mx-auto max-w-lg">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-100">
            <Image
              src={property.heroImage.src}
              alt={property.heroImage.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div className="pt-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">{property.location}</span>
              <ZoningBadges land={land} detail />
              {isSoldOut && <span className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700">ขายแล้ว</span>}
            </div>
            <h1 className="mt-3 text-2xl font-black leading-tight text-slate-950">{property.title}</h1>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-sm text-slate-500">ขนาด</div>
                <div className="mt-1 text-sm font-bold leading-snug text-slate-900">{property.size}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-sm text-slate-500">ราคา / ไร่</div>
                <div className="mt-1 text-sm font-bold leading-snug text-brand-900">{property.pricePerRai}</div>
              </div>
              {totalPriceLabel && (
                <div className="col-span-2 rounded-xl bg-brand-50 p-3">
                  <div className="text-sm text-slate-500">{isSoldOut ? "ราคารวมเดิม" : "ราคารวม"}</div>
                  <div className="mt-1 text-xl font-black text-brand-900">{totalPriceLabel}</div>
                </div>
              )}
              {referralReward != null && <ReferralCallout reward={referralReward} variant="mobile" />}
            </div>
            <div className="mt-4">
              <VerificationSummary land={land} />
            </div>
            <PropertyMobileActions
              listingId={land.id}
              listingRef={land.public_ref}
              listingTitle={property.title}
              soldOut={isSoldOut}
              referralReward={referralReward}
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <section className="card p-4 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <Ruler size={20} className="text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">ข้อมูลที่ดิน</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
                {property.facts.map((fact) => (
                  <div key={fact.label} className="min-w-0 rounded-xl bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-500">{fact.label}</div>
                    <div className="wrap-break-word mt-1 font-bold text-slate-800">{fact.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-5 flex items-center gap-2">
                <Factory size={20} className="text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">จุดเด่นของแปลงนี้</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {property.highlightCards.map((card, index) => {
                  const Icon = highlightIcons[index] ?? ShieldCheck;
                  return (
                    <div key={card.title} className="card-ref flex gap-4 p-4 sm:block sm:p-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 sm:mb-4 sm:h-11 sm:w-11">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{card.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-2">
                          {card.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {land && <>
              <div className="hidden md:block"><VerificationSummary land={land} /></div>
              {inventory ? <PropertyIntelligence land={land} inventory={inventory} /> : <p role="alert">ข้อมูลประกาศเปรียบเทียบไม่พร้อมใช้งานชั่วคราว</p>}
            </>}

            {property.mapEmbed && (
              <section>
                <div className="mb-5 flex items-center gap-2">
                  <MapPin size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">พิกัดและทำเลที่ตั้ง</h2>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-slate-600">
                  {property.mapEmbed.description}
                </p>
                <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                  <iframe
                    src={property.mapEmbed.embedUrl}
                    className="h-[300px] w-full sm:h-[420px]"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`แผนที่ ${property.title}`}
                  />
                </div>
                <div className="mt-4">
                  <a
                    href={property.mapEmbed.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline inline-flex items-center gap-2 text-sm"
                  >
                    <ExternalLink size={15} />
                    เปิดแผนที่ใน Google Maps
                  </a>
                </div>
              </section>
            )}

            <section>
              <div className="mb-5 flex items-center gap-2">
                <MapPin size={20} className="text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">รูปภาพเพิ่มเติม</h2>
              </div>
              <div className="md:hidden">
                {mobileGallery.length > 0 ? (
                  <PropertyGallery images={mobileGallery} title={property.title} />
                ) : (
                  <p className="text-sm text-slate-500">ไม่มีรูปเพิ่มเติม</p>
                )}
              </div>
              <div className="hidden md:block">
                <PropertyGallery images={property.gallery} title={property.title} />
              </div>
            </section>

            {property.videos && property.videos.length > 0 && (
              <section>
                <div className="mb-5 flex items-center gap-2">
                  <Video size={20} className="text-brand-600" />
                  <h2 className="text-xl font-bold text-slate-900">วิดีโอพื้นที่</h2>
                </div>
                <PropertyVideos videos={property.videos} />
              </section>
            )}
          </div>

          <aside className="hidden min-w-0 md:block lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              {isSoldOut ? (
                <>
                  <div className="bg-[#071d4a] p-5 text-white">
                    <p className="mt-3 text-sm leading-relaxed text-blue-50">
                      แปลงนี้ปิดการขายเรียบร้อยแล้ว และไม่ได้เปิดรับข้อเสนอหรือผู้แนะนำเพิ่มเติม
                    </p>
                  </div>
                  <div className="space-y-4 p-4 sm:p-5">
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">ขนาดที่ดิน</div>
                        <div className="wrap-break-word font-bold text-slate-800">{property.size}</div>
                      </div>
                    </div>
                    <Link href="/land" className="btn-green w-full text-sm">
                      ดูที่ดินที่ยังเปิดขาย
                    </Link>
                    <LineButton
                      size="md"
                      label="สอบถามแปลงใกล้เคียงผ่าน LINE"
                      className="w-full text-sm"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#071d4a] p-5 text-white">
                    <div className="text-sm font-semibold text-blue-100">สนใจที่ดินแปลงนี้?</div>
                    <p className="mt-2 text-sm leading-relaxed text-blue-50">
                      ฝากเบอร์โทรหรือเพิ่ม LINE OA เพื่อรับข้อมูลทำเล ราคา เอกสาร และนัดหมายเข้าชมพื้นที่
                    </p>
                  </div>

                  <div className="space-y-4 p-4 sm:p-5" id="inquiry">
                    <LeadForm listingId={land?.id} compact defaultType="buyer" submitLabel="ขอข้อมูลที่ดินแปลงนี้" />

                    <LineButton
                      size="md"
                      label="หรือทัก LINE OA"
                      className="w-full text-sm"
                    />
                  </div>

                  {referralReward != null && <ReferralCallout reward={referralReward} variant="sidebar" />}
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      {similar.length > 0 && <section className="container-xl section">
        <h2 className="mb-6 text-xl font-bold">ที่ดินใกล้เคียงที่ยังเปิดขาย</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{similar.map(item => <ListingCard key={item.id} land={item} {...resolveListingPresentation(item)} />)}</div>
      </section>}

      <section className="px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl">
          <div className="relative overflow-hidden rounded-[26px] bg-[#071d4a] p-5 text-white shadow-[0_14px_36px_rgba(13,30,70,0.10)] sm:p-7 lg:p-9">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#00A859]/20" />
            {isSoldOut ? (
              <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="text-xl font-black sm:text-2xl">
                    แปลงนี้ปิดการขายเรียบร้อยแล้ว
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">
                    ดูรายการที่ยังเปิดขาย หรือสอบถามทีมงาน LandmarketThai เพื่อหาแปลงใกล้เคียงตามความต้องการ
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                  <Link href="/land" className="btn-white w-full sm:w-auto">
                    ดูที่ดินที่ยังเปิดขาย
                  </Link>
                  <LineButton
                    size="md"
                    label="สอบถามแปลงใกล้เคียง"
                    className="w-full sm:w-auto text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="text-xl font-black sm:text-2xl">
                    ต้องการข้อมูลเพิ่มเติมหรือนัดชมพื้นที่?
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">
                    ติดต่อทีมงาน LandmarketThai เพื่อรับข้อมูลทำเล ราคา เอกสาร หรือนัดเข้าชมพื้นที่
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                  <Link href="#inquiry" className="btn-green hidden w-full sm:w-auto md:inline-flex">
                    <Send size={16} />
                    ขอข้อมูลแปลงนี้
                  </Link>
                  <LineButton
                    size="md"
                    label="ทัก LINE OA"
                    className="w-full sm:w-auto text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
