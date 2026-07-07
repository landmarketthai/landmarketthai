import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Ruler, Tag, Award, ChevronRight } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import ListingCard from "@/components/listings/ListingCard";
import ShareButton from "@/components/listings/ShareButton";
import JsonLd from "@/components/seo/JsonLd";
import LeadForm from "@/components/forms/LeadForm";
import { getListingByRef, getRelatedListings } from "@/lib/supabase/queries";
import { LAND_TYPE_LABELS, ZONING_LABELS, formatRai, formatMoney, formatMoneyFull, listingHref } from "@/lib/utils";

export const revalidate = 3600;

interface Params { slug: string }

function parseRef(slug: string): number | null {
  const ref = parseInt(slug.split("-")[0], 10);
  return isNaN(ref) ? null : ref;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const ref = parseRef(slug);
  if (!ref) return {};
  const land = await getListingByRef(ref).catch(() => null);
  if (!land) return {};
  return {
    title: land.seo_title ?? land.title_th,
    description:
      land.seo_description ??
      `${LAND_TYPE_LABELS[land.land_type]} ${land.province?.name_th ?? ""} ${formatRai(land.size_rai)} ราคา ${formatMoney(land.price_per_rai)} บาท/ไร่`,
    alternates: { canonical: listingHref(land.public_ref, land.slug) },
    openGraph: {
      images: land.images?.[0]?.url_or_cdn_path ? [land.images[0].url_or_cdn_path] : [],
    },
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const ref = parseRef(slug);
  if (!ref) notFound();

  const land = await getListingByRef(ref).catch(() => null);
  if (!land) notFound();

  const related = await getRelatedListings(land, 3).catch(() => []);

  const listingSchema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: land.title_th,
    description: land.description ?? "",
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${listingHref(land.public_ref, land.slug)}`,
    image: land.images?.map((img) => img.url_or_cdn_path) ?? [],
    address: {
      "@type": "PostalAddress",
      addressRegion: land.province?.name_en ?? "",
      addressCountry: "TH",
    },
    offers: {
      "@type": "Offer",
      price: land.total_price ?? land.price_per_rai * land.size_rai,
      priceCurrency: "THB",
      availability: land.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: "/" },
      { "@type": "ListItem", position: 2, name: "ที่ดิน", item: "/land" },
      { "@type": "ListItem", position: 3, name: land.province?.name_th, item: `/land/${land.province?.slug}` },
      { "@type": "ListItem", position: 4, name: land.title_th, item: listingHref(land.public_ref, land.slug) },
    ],
  };

  return (
    <div className="container-xl section">
      <JsonLd data={[listingSchema, breadcrumb]} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-slate-500 mb-6">
        <Link href="/" className="hover:text-brand-600">หน้าแรก</Link>
        <ChevronRight size={12} />
        <Link href="/land" className="hover:text-brand-600">ที่ดิน</Link>
        <ChevronRight size={12} />
        {land.province && (
          <>
            <Link href={`/land/${land.province.slug}`} className="hover:text-brand-600">
              {land.province.name_th}
            </Link>
            <ChevronRight size={12} />
          </>
        )}
        <span className="text-slate-700 line-clamp-1">{land.title_th}</span>
      </nav>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Gallery */}
          {land.images && land.images.length > 0 ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-100 aspect-video">
              <Image
                src={land.images[0].url_or_cdn_path}
                alt={land.images[0].alt_th ?? land.title_th}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-100 aspect-video flex items-center justify-center text-slate-300">
              <Ruler size={64} />
            </div>
          )}

          {/* Sub-images */}
          {land.images && land.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {land.images.slice(1, 5).map((img) => (
                <div key={img.id} className="relative rounded-xl overflow-hidden bg-slate-100 aspect-square">
                  <Image
                    src={img.url_or_cdn_path}
                    alt={img.alt_th ?? ""}
                    fill
                    sizes="25vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className="badge bg-brand-100 text-brand-700 px-3 py-1">
              {LAND_TYPE_LABELS[land.land_type]}
            </span>
            {land.is_eec && <span className="badge bg-brand-500 text-white px-3 py-1">EEC Zone</span>}
            {land.zoning && (
              <span className="badge bg-purple-100 text-purple-700 px-3 py-1">
                ผังสี{ZONING_LABELS[land.zoning]}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900">{land.title_th}</h1>

          {/* Key facts grid */}
          {(() => {
            type Fact = { icon: React.ReactNode; label: string; value: string };
            const facts: Fact[] = [
              { icon: <MapPin size={16} />, label: "จังหวัด", value: land.province?.name_th ?? "–" },
              { icon: <Ruler size={16} />, label: "พื้นที่", value: formatRai(land.size_rai) },
              { icon: <Tag size={16} />, label: "ราคา/ไร่", value: `${formatMoney(land.price_per_rai)} ฿` },
              ...(land.frontage_m ? [{ icon: <Ruler size={16} />, label: "หน้ากว้าง", value: `${land.frontage_m} ม.` }] : []),
              ...(land.zoning ? [{ icon: <Tag size={16} />, label: "ผังสีเมือง", value: ZONING_LABELS[land.zoning] }] : []),
              ...(land.total_price ? [{ icon: <Tag size={16} />, label: "ราคารวม", value: `${formatMoney(land.total_price)} ฿` }] : []),
            ];
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {facts.map((fact) => (
                  <div key={fact.label} className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                      {fact.icon}
                      {fact.label}
                    </div>
                    <div className="font-semibold text-slate-800">{fact.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Referral reward */}
          {land.referral_reward_max && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <Award size={20} className="text-green-600 shrink-0" />
              <div>
                <div className="font-semibold text-green-800">
                  ค่าแนะนำสูงสุด {formatMoneyFull(land.referral_reward_max)}
                </div>
                <div className="text-sm text-green-600">แนะนำผู้ซื้อหรือเจ้าของที่ดิน รับค่าคอมเมื่อปิดดีล</div>
              </div>
              <Link href="/become-partner" className="ml-auto text-xs text-green-700 underline whitespace-nowrap">
                สมัครพาร์ทเนอร์
              </Link>
            </div>
          )}

          {/* Nearby landmarks */}
          {land.nearby_landmarks && land.nearby_landmarks.length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-800 mb-3">ใกล้กับ</h2>
              <div className="flex flex-wrap gap-2">
                {land.nearby_landmarks.map((lm) => (
                  <span key={lm} className="badge bg-slate-100 text-slate-600 px-3 py-1 text-sm">
                    📍 {lm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {land.description && (
            <div>
              <h2 className="font-semibold text-slate-800 mb-3">รายละเอียด</h2>
              <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                {land.description}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar CTA */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 flex flex-col gap-4">
            <div className="card p-6">
              <div className="text-2xl font-bold text-brand-600 mb-1">
                {formatMoney(land.price_per_rai)} ฿/ไร่
              </div>
              {land.total_price && (
                <div className="text-sm text-slate-500 mb-4">
                  รวม {formatMoneyFull(land.total_price)}
                </div>
              )}
              <LeadForm
                listingId={land.id}
                defaultType="buyer"
                compact
              />
            </div>

            <LineButton size="md" label="สอบถามผ่าน LINE OA" className="w-full justify-center" />

            <ShareButton title={land.title_th} />
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl font-bold text-slate-900 mb-6">ที่ดินใกล้เคียง</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((land) => (
              <ListingCard key={land.id} land={land} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
