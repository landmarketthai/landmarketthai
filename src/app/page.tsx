import { LINE_OA, SITE_URL } from "@/lib/constants/site";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Handshake, MapPin, Search } from "lucide-react";
import MobileStickyCta from "@/components/ui/MobileStickyCta";
import ListingCard from "@/components/listings/ListingCard";
import LineIcon from "@/components/ui/LineIcon";
import JsonLd from "@/components/seo/JsonLd";
import { getActiveDemands, getFeaturedListings, getListingBySlug } from "@/lib/neon/queries";
import BuyerDemandList, { isPublishedDemand } from "@/components/demand/BuyerDemandList";
import { SEED_109_RAI_SLUG, resolveListingPresentation } from "@/lib/seed-listings";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL },
  title: { absolute: "LandmarketThai – ที่ดินอุตสาหกรรม EEC พร้อมขาย" },
  description: "ที่ดินอุตสาหกรรม EEC พร้อมขาย ทีมงานดูแลข้อมูล นัดดูพื้นที่ และการเจรจา ผู้แนะนำผู้ซื้อรับค่าแนะนำเมื่อดีลสำเร็จ",
};

const steps = [
  ["ส่งชื่อผู้ซื้อ", "ทาง LINE หรือแบบฟอร์ม ไม่ต้องลงทุน"],
  ["ทีมงานดูแลต่อ", "ข้อมูล นัดดูพื้นที่ และการเจรจา"],
  ["ดีลสำเร็จ รับค่าแนะนำ", "ตามเงื่อนไขของแต่ละแปลง"],
];

export default async function HomePage() {
  const [buyerDemands, featured, soldProof] = await Promise.all([
    getActiveDemands(4).then(demands => demands.filter(isPublishedDemand)).catch(() => null),
    getFeaturedListings(12).catch(() => []),
    getListingBySlug(SEED_109_RAI_SLUG).catch(() => null),
  ]);
  const openListings = featured.filter(land => land.status === "active").slice(0, 6);
  const topReward = Math.max(0, ...openListings.map(land => land.referral_reward_max ?? 0));
  const orgSchema = {
    "@context": "https://schema.org", "@type": "Organization",
    name: "LandmarketThai", url: SITE_URL, description: "แพลตฟอร์มที่ดินอุตสาหกรรมและ EEC",
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", availableLanguage: "Thai" },
  };

  return <>
    <JsonLd data={[orgSchema]} />

    {/* Hero: buyer action first, broker action second, seller as a text link */}
    {/* Keep copy and controls outside the photo at every width so faces stay unobstructed. */}
    <section className="hero-banner">
      <div className="container-xl grid md:grid-cols-2 md:items-center">
        <div className="px-4 pb-5 pt-6 sm:px-6 md:col-start-1 md:row-start-1 md:pb-0 md:pt-8 lg:px-8 lg:pt-10">
          <h1 className="text-[1.7rem] font-black leading-[1.2] text-[#06235f] sm:text-4xl lg:text-5xl">
            ที่ดินอุตสาหกรรม EEC<br />พร้อมขาย
          </h1>
          <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[#0a2a63] sm:mt-3 sm:text-base lg:text-lg">
            ข้อมูลตรวจสอบโดยทีมงาน พร้อมนัดดูพื้นที่และดูแลการเจรจาจนจบ
          </p>
        </div>
        <div className="relative row-start-2 aspect-[1561/1008] md:col-start-2 md:row-span-2 md:row-start-1">
          <Image src="/images/final-banner.png" alt="" fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-contain" />
        </div>
        <div className="px-4 py-6 sm:px-6 md:col-start-1 md:row-start-2 md:pt-0 lg:px-8 lg:pb-10">
          <Link href="#listings" className="btn-green w-full px-8 text-base sm:w-auto md:mt-6">ดูที่ดินพร้อมขาย</Link>
          {/* Broker path reads as a full sentence so first-time visitors know who it is for */}
          <Link
            href="/become-partner"
            className="mt-3 flex items-start gap-3 rounded-xl border border-gold-400/70 bg-[#071d4a]/85 px-4 py-3 text-sm text-white transition-colors hover:bg-[#071d4a] md:max-w-md"
          >
            <Handshake size={20} className="mt-0.5 shrink-0 text-gold-400" />
            <span>
              รู้จักคนกำลังหาที่ดินโรงงาน? แนะนำให้ทีมเรา
              <strong className="block text-gold-400">
                {topReward > 0 ? `รับค่าแนะนำสูงสุด ${formatMoney(topReward)}บาท เมื่อปิดดีล` : "รับค่าแนะนำเมื่อปิดดีล"} →
              </strong>
            </span>
          </Link>
          <Link href="/sell" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#0f3478]">
            มีที่ดินต้องการขาย <ArrowRight size={14} />
          </Link>
          <div className="mt-4 hidden max-w-md items-center gap-3 rounded-2xl bg-[#06235f] p-3 shadow-lg lg:flex">
            <Image src="/images/line-qr.png" alt="คิวอาร์โค้ด LINE OA" width={288} height={288} className="h-24 w-24 shrink-0 rounded-lg bg-white p-2" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-black text-white">คุยกับทีมงาน</p>
              <p className="mt-1 text-xs font-semibold text-gold-400">สอบถามที่ดินและเงื่อนไขผู้แนะนำ</p>
              <a href={LINE_OA} target="_blank" rel="noopener noreferrer" className="btn-line mt-2 w-full px-2 text-sm">
                <LineIcon size={18} /> @landmarketthai
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="listings" className="container-xl scroll-mt-20 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl font-black text-[#06235f]">ที่ดินพร้อมขาย</h2>
        <Link href="/search?view=map" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700">
          <MapPin size={16} /> ดูบนแผนที่
        </Link>
      </div>
      {openListings.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {openListings.map(land => <ListingCard key={land.id} land={land} {...resolveListingPresentation(land)} />)}
          {/* ponytail: buyer-demand card always closes the grid; fine while inventory is small, revisit past ~5 listings */}
          <div className="flex flex-col justify-center gap-4 rounded-xl bg-[#071d4a] p-6 text-white sm:col-span-2 lg:col-span-1">
            <Search size={32} className="text-[#00A859]" />
            <div>
              <h3 className="text-xl font-black">ยังไม่เจอแปลงที่ใช่?</h3>
              <p className="mt-2 text-blue-100">บอกทำเล ขนาด และงบประมาณ ทีมงานจะหาแปลงที่ตรงให้ ไม่มีค่าใช้จ่าย</p>
            </div>
            <Link href="/buy-request" className="btn-green px-6 text-base">ฝากความต้องการซื้อ</Link>
          </div>
        </div>
      ) : (
        <p className="text-base text-slate-600">ยังไม่มีที่ดินเปิดขายในขณะนี้ <Link href="/buy-request" className="font-semibold text-brand-700 underline">ฝากความต้องการไว้ก่อน</Link></p>
      )}
    </section>

    {buyerDemands === null ? (
      <p className="container-xl px-4 pb-6 text-sm text-slate-500" role="alert">
        โหลดรายการผู้ซื้อกำลังหาไม่ได้ในขณะนี้ <Link href="/buyer-demand" className="font-semibold text-brand-700 underline">ลองดูอีกครั้ง</Link>
      </p>
    ) : buyerDemands.length > 0 && (
      <section className="bg-slate-50 py-10">
        <div className="container-xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-black text-[#06235f]">ผู้ซื้อกำลังหาที่ดิน</h2>
          <p className="mt-1 text-slate-600">มีที่ดินหรือรู้จักเจ้าของที่ตรงกับความต้องการเหล่านี้? ส่งข้อมูลให้ทีมงานได้เลย</p>
          <div className="mt-5"><BuyerDemandList demands={buyerDemands} /></div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/sell" className="btn-primary">ส่งข้อมูลที่ดิน</Link>
            <Link href="/buyer-demand" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700">
              ดูทั้งหมด <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    )}

    <section className="container-xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-2xl font-black text-[#06235f]">มีผู้ซื้อในมือ? แนะนำแล้วรับค่าแนะนำ</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {steps.map(([title, detail], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 font-black text-[#071d4a]">{index + 1}</span>
                <div>
                  <div className="font-bold text-slate-900">{title}</div>
                  <div className="text-sm text-slate-600">{detail}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Link href="/become-partner" className="btn-gold px-6 text-base">
          <Handshake size={18} /> สมัครผู้แนะนำ ฟรี
        </Link>
      </div>
    </section>

    {soldProof?.status === "sold" && (
      <section className="container-xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:items-center">
          <div className="md:order-last">
            <h2 className="text-2xl font-black text-[#06235f]">ผลงานปิดการขาย</h2>
            <p className="mt-2 max-w-md text-slate-600">ทีมงานดูแลตั้งแต่ข้อมูลแปลง นัดดูพื้นที่ จนถึงการเจรจาปิดดีล</p>
            <Link href="/sell" className="mt-4 inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700">
              มีที่ดินต้องการขาย? ฝากขายกับเรา <ArrowRight size={14} />
            </Link>
          </div>
          <ListingCard land={soldProof} {...resolveListingPresentation(soldProof)} ctaLabel="ดูผลงานปิดการขาย" />
        </div>
      </section>
    )}

    <MobileStickyCta />
  </>;
}
