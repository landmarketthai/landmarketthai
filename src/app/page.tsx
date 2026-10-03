import { SITE_URL } from "@/lib/constants/site";
import type { Metadata } from "next";
import Link from "next/link";
import MobileStickyCta from "@/components/ui/MobileStickyCta";
import ListingCard from "@/components/listings/ListingCard";
import JsonLd from "@/components/seo/JsonLd";
import { getActiveDemands, getFeaturedListings, getListingBySlug } from "@/lib/neon/queries";
import BuyerDemandList, { isPublishedDemand } from "@/components/demand/BuyerDemandList";
import { SEED_109_RAI_SLUG, resolveListingPresentation } from "@/lib/seed-listings";
import { VERIFICATION_TITLES } from "@/lib/marketplace/verification";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL },
  title: { absolute: "LandmarketThai – ซื้อ ขาย และแนะนำอสังหาริมทรัพย์" },
  description: "ตลาดอสังหาริมทรัพย์สำหรับผู้ซื้อ เจ้าของทรัพย์ และผู้แนะนำ ค้นหาทรัพย์ ฝากซื้อ ฝากขาย และเชื่อมต่อดีลกับ LandmarketThai",
};
const shortcuts = [
  ["ที่ดิน", "/search?property_type=land"], ["โรงงาน", "/search?property_type=factory"],
  ["โกดัง", "/search?property_type=warehouse"], ["EEC", "/search?eec=1"], ["ผังม่วง", "/search?zoning=purple"],
];

export default async function HomePage() {
  const [buyerDemands, featured, soldProof] = await Promise.all([
    getActiveDemands(4).then(demands => demands.filter(isPublishedDemand)).catch(() => null),
    getFeaturedListings(12).catch(() => []),
    getListingBySlug(SEED_109_RAI_SLUG).catch(() => null),
  ]);
  const openListings = featured.filter(land => land.status === "active").slice(0, 6);
  const orgSchema = {
    "@context": "https://schema.org", "@type": "Organization",
    name: "LandmarketThai", url: SITE_URL, description: "แพลตฟอร์มค้นหาและฝากขายอสังหาริมทรัพย์",
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", availableLanguage: "Thai" },
  };
  return <>
    <JsonLd data={[orgSchema]} />
    <section className="bg-brand-50 px-4 py-5 sm:py-10">
      <div className="container-xl">
        <h1 className="max-w-3xl text-2xl font-black leading-tight text-brand-900 sm:text-4xl">ซื้อ ขาย และแนะนำอสังหาริมทรัพย์ในที่เดียว</h1>
        <p className="mt-2 max-w-2xl text-base text-slate-700">LandmarketThai เชื่อมผู้ซื้อ เจ้าของทรัพย์ และผู้แนะนำ ให้เริ่มต้นดีลได้จากทางที่ตรงกับคุณ</p>
        <p className="mt-2 text-sm text-slate-600">ทุกประกาศบอกชัดว่าข้อมูลส่วนไหนผ่านการตรวจสอบแล้ว</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link href="/search" className="min-h-11 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700">
            คนซื้อ · ค้นหาทรัพย์
          </Link>
          <Link href="/sell" className="min-h-11 rounded-xl border border-brand-200 bg-white px-4 py-3 text-center text-sm font-bold text-brand-900 hover:bg-brand-50">
            คนขาย · ฝากขายทรัพย์
          </Link>
          <Link href="/become-partner" className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-900 hover:bg-amber-100">
            ผู้แนะนำ · ส่งต่อดีล
          </Link>
        </div>
        <div className="mt-2 text-center sm:text-left">
          <Link href="/buy-request" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">ยังไม่เจอทรัพย์ที่ใช่? ฝากความต้องการซื้อ →</Link>
        </div>
      </div>
    </section>
    <section aria-label="ค้นหาตามทำเลและประเภททรัพย์" className="container-xl px-4 py-3">
      <form action="/search" className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label htmlFor="home-location" className="sr-only">จังหวัดหรือทำเล</label>
        <input id="home-location" name="q" placeholder="จังหวัด / อำเภอ / ทำเล" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-base" />
        <button className="btn-green min-h-11 px-3" type="submit">ค้นหา</button>
        <Link href="/search?view=map" className="btn-outline col-span-2 min-h-11 justify-center px-3 text-sm">ดูบนแผนที่</Link>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {shortcuts.map(([label, href]) => <Link key={label} href={href} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-3 text-sm text-brand-800">{label}</Link>)}
        <Link href="/search" className="inline-flex min-h-11 items-center px-3 text-sm text-brand-800">ทุกประเภท</Link>
      </div>
    </section>
    <section className="container-xl px-4 pb-6 pt-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">ทรัพย์แนะนำที่เปิดขาย</h2>
        <Link href="/search?status=active" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">ดูทั้งหมด →</Link>
      </div>
      {openListings.length ? <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
        {openListings.map(land => <div key={land.id} className="w-[85%] shrink-0 snap-start md:w-auto"><ListingCard land={land} {...resolveListingPresentation(land)} publicBuyerMode /></div>)}
      </div> : <p className="text-base text-slate-600">ยังไม่มีทรัพย์แนะนำในขณะนี้ <Link href="/search" className="inline-flex min-h-11 items-center underline">ค้นหาทรัพย์ทั้งหมด</Link></p>}
    </section>
    <section className="container-xl px-4 py-6">
      <h2 className="text-xl font-bold">เราตรวจอะไรบ้าง</h2>
      <p className="mt-2 text-base text-slate-600">บอกชัดว่าตรวจอะไรแล้ว แสดงสถานะแยกในแต่ละประกาศ หัวข้อที่มีข้อมูลยังไม่เท่ากับผ่านการตรวจสอบ</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Object.entries(VERIFICATION_TITLES).map(([key, title]) => <li key={key} className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{title}</li>)}
      </ul>
      <p className="mt-3 text-sm text-slate-600">การตรวจประกาศไม่ใช่การรับรองทุกข้อมูล กรรมสิทธิ์ หรือผลตอบแทน ควรตรวจเอกสารและข้อมูลเพิ่มเติมก่อนตัดสินใจ</p>
    </section>
    {soldProof?.status === "sold" && <section className="container-xl px-4 py-6">
      <h2 className="mb-4 text-xl font-bold">ผลงานปิดการขาย</h2>
      <div className="max-w-sm"><ListingCard land={soldProof} {...resolveListingPresentation(soldProof)} publicBuyerMode ctaLabel="ดูผลงานปิดการขาย" /></div>
    </section>}
    <section className="container-xl px-4 py-6">
      <div className="rounded-2xl bg-brand-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div><h2 className="text-xl font-bold">ไม่เจอแปลงที่ใช่?</h2><p className="mt-2 text-base text-slate-600">ฝากทำเล งบประมาณ และประเภททรัพย์ที่ต้องการให้ทีมช่วยหา</p></div>
        <Link href="/buy-request" className="btn-green mt-4 min-h-11 sm:mt-0">ฝากความต้องการซื้อ</Link>
      </div>
    </section>
    {buyerDemands === null ? (
      <section className="container-xl px-4 py-4 text-center" role="alert">
        <p className="text-sm text-slate-500">โหลดความต้องการซื้อไม่ได้ในขณะนี้ แต่ยังฝากความต้องการซื้อใหม่ได้</p>
        <Link href="/buy-request" className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-700">ฝากความต้องการซื้อ →</Link>
      </section>
    ) : buyerDemands.length > 0 && (
      <section className="container-xl px-4 py-6">
        <h2 className="mb-4 text-xl font-bold">ความต้องการซื้อที่เผยแพร่</h2>
        <BuyerDemandList demands={buyerDemands} />
        <Link href="/buyer-demand" className="mt-3 inline-flex min-h-11 items-center text-sm text-brand-700">ดูความต้องการซื้อทั้งหมด →</Link>
      </section>
    )}
    <section className="container-xl px-4 py-6">
      <h2 className="text-xl font-bold">เริ่มดีลจากบทบาทของคุณ</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Link href="/search" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="text-sm font-semibold text-emerald-700">สำหรับผู้ซื้อ</div>
          <h3 className="mt-1 text-lg font-bold">ค้นหาทรัพย์หรือฝากซื้อ</h3>
          <p className="mt-2 text-base text-slate-600">ดูทรัพย์ที่เปิดขาย หรือฝากเงื่อนไขให้ทีมช่วยจับคู่</p>
        </Link>
        <Link href="/sell" className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5">
          <div className="text-sm font-semibold text-brand-700">สำหรับเจ้าของทรัพย์</div>
          <h3 className="mt-1 text-lg font-bold">ฝากขายกับ LandmarketThai</h3>
          <p className="mt-2 text-base text-slate-600">ส่งข้อมูลทรัพย์เพื่อเข้าสู่ขั้นตอนตรวจสอบและประกาศขาย</p>
        </Link>
        <Link href="/become-partner" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="text-sm font-semibold text-amber-800">สำหรับผู้แนะนำ / นายหน้า</div>
          <h3 className="mt-1 text-lg font-bold">แนะนำคนซื้อหรือเจ้าของทรัพย์</h3>
          <p className="mt-2 text-base text-slate-600">ส่งต่อโอกาสทางการขายและรับค่าตอบแทนตามเงื่อนไขเมื่อดีลสำเร็จ</p>
        </Link>
      </div>
    </section>
    <MobileStickyCta />
  </>;
}
