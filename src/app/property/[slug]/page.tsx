import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle,
  ExternalLink,
  Factory,
  Handshake,
  MapPin,
  Ruler,
  Send,
  ShieldCheck,
  Truck,
  Video,
} from "lucide-react";
import LeadForm from "@/components/forms/LeadForm";
import PropertyGallery from "@/components/properties/PropertyGallery";
import PropertyVideos from "@/components/properties/PropertyVideos";
import LineButton from "@/components/ui/LineButton";
import {
  getPropertyDetail,
  propertyDetails,
} from "@/lib/property-detail-data";

interface Params {
  slug: string;
}

const highlightIcons = [Factory, Truck, ShieldCheck];

export function generateStaticParams() {
  return propertyDetails.map((property) => ({ slug: property.slug }));
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const property = getPropertyDetail(slug);

  if (!property) notFound();

  return (
    <main className="bg-white">
      <section className="relative overflow-hidden bg-slate-950 text-white">
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
              <span className="rounded-full bg-purple-500/90 px-3 py-1 text-xs font-bold text-white">
                {property.zoning}
              </span>
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
              <div className="rounded-2xl border border-gold-400/60 bg-[#071d4a]/92 px-4 py-4 shadow-lg sm:px-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
                  <BadgeDollarSign size={16} className="text-gold-400" />
                  ค่าแนะนำ
                </div>
                <div className="mt-1 text-xl font-black text-gold-400 sm:text-2xl">
                  {property.referralReward}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <section className="card p-4 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <Ruler size={20} className="text-brand-600" />
                <h2 className="text-xl font-bold text-slate-900">ข้อมูลที่ดิน</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {property.facts.map((fact) => (
                  <div key={fact.label} className="min-w-0 rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-400">{fact.label}</div>
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {property.highlightCards.map((card, index) => {
                  const Icon = highlightIcons[index] ?? ShieldCheck;
                  return (
                    <div key={card.title} className="card-ref p-5">
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon size={22} />
                      </div>
                      <h3 className="font-bold text-slate-900">{card.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {card.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

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
                <h2 className="text-xl font-bold text-slate-900">รูปภาพและทำเล</h2>
              </div>
              <PropertyGallery images={property.gallery} title={property.title} />
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

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="card overflow-hidden">
              <div className="bg-[#071d4a] p-5 text-white">
                <div className="text-sm font-semibold text-blue-100">สนใจที่ดินแปลงนี้?</div>
                <p className="mt-2 text-sm leading-relaxed text-blue-50">
                  ฝากเบอร์โทรหรือเพิ่ม LINE OA เพื่อรับข้อมูลทำเล ราคา เอกสาร และนัดหมายเข้าชมพื้นที่
                </p>
              </div>

              <div className="space-y-4 p-4 sm:p-5" id="inquiry">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-400">ขนาดที่ดิน</div>
                    <div className="wrap-break-word font-bold text-slate-800">{property.size}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs text-slate-400">ค่าแนะนำ</div>
                    <div className="wrap-break-word font-bold text-gold-500">{property.referralReward}</div>
                  </div>
                </div>

                <LineButton
                  size="md"
                  label="สอบถามผ่าน LINE OA"
                  className="w-full text-sm"
                />

                <LeadForm compact defaultType="buyer" listingId={property.slug} submitLabel="ขอข้อมูลที่ดินแปลงนี้" />

                <div className="grid gap-2 border-t border-slate-100 pt-4">
                  <Link href="/contact" className="btn-outline w-full text-sm">
                    <CalendarDays size={16} />
                    นัดหมายเข้าชมพื้นที่
                  </Link>
                  <Link href="/become-partner" className="btn-green w-full text-sm opacity-90">
                    <Handshake size={16} />
                    แนะนำลูกค้า รับค่าแนะนำ
                  </Link>
                </div>
              </div>
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
                  ต้องการข้อมูลเพิ่มเติมหรือนัดชมพื้นที่?
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">
                  ติดต่อทีมงาน LandmarketThai เพื่อรับข้อมูลทำเล ราคา เอกสาร หรือนัดเข้าชมพื้นที่
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                <LineButton
                  size="md"
                  label="สอบถามผ่าน LINE OA"
                  className="w-full sm:w-auto text-sm"
                />
                <Link href="#inquiry" className="btn-white w-full sm:w-auto">
                  <Send size={16} />
                  ขอข้อมูลที่ดินแปลงนี้
                </Link>
                <Link href="/contact" className="btn-outline w-full border-white/30 text-white hover:bg-white/10 sm:w-auto">
                  <CalendarDays size={16} />
                  นัดหมายเข้าชมพื้นที่
                </Link>
                <Link href="/become-partner" className="btn-green w-full opacity-90 sm:w-auto">
                  <Handshake size={16} />
                  แนะนำลูกค้า รับค่าแนะนำ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
