import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PartnerForm from "@/components/forms/PartnerForm";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";
import ListingCard from "@/components/listings/ListingCard";
import { getFeaturedListings } from "@/lib/neon/queries";
import { resolveListingPresentation } from "@/lib/seed-listings";

export const metadata: Metadata = {
  title: "สมัครพาร์ทเนอร์ – หารายได้จากที่ดินอุตสาหกรรม",
  description:
    "แนะนำผู้ซื้อหรือเจ้าของที่ดินอุตสาหกรรมให้ LandmarketThai สมัครฟรี รับค่าแนะนำตามเงื่อนไขของแต่ละแปลงเมื่อปิดดีล",
  alternates: { canonical: "/become-partner" },
  openGraph: { url: "/become-partner" },
};

const faqItems = [
  {
    q: "ต้องมีใบอนุญาตนายหน้าไหม?",
    a: "ไม่ต้อง คุณทำหน้าที่แนะนำผู้ซื้อหรือผู้ขาย ทีม LandmarketThai ดูแลกระบวนการประสานงาน",
  },
  {
    q: "รับค่าแนะนำเมื่อไหร่?",
    a: "เมื่อปิดดีลและโอนกรรมสิทธิ์เสร็จสมบูรณ์ จ่ายผ่านโอนธนาคาร พร้อมหลักฐาน",
  },
  {
    q: "ถ้าไม่มีที่ดินแนะนำ แต่รู้จักคนที่อยากซื้อ ได้ไหม?",
    a: "ได้ การแนะนำผู้ซื้อรับค่าแนะนำได้เช่นกัน",
  },
  {
    q: "ทำงานร่วมกับที่ดินหลายแปลงได้ไหม?",
    a: "ได้ แนะนำได้ทุกแปลงที่เปิดรับแนะนำ",
  },
];

export default async function BecomePartnerPage() {
  const openListings = (await getFeaturedListings(12).catch(() => []))
    .filter((land) => land.status === "active" && land.referral_reward_max != null);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div>
      <JsonLd data={faqSchema} />

      {/* Hero */}
      <section className="bg-[#071d4a] px-4 py-10 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="container-xl mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-black leading-tight sm:text-5xl">
            รู้จักคนกำลังหาที่ดินโรงงาน?
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-blue-100 sm:text-lg">
            ส่งชื่อผู้ซื้อหรือเจ้าของที่ดินให้ทีมเรา ทีมงานดูแลข้อมูล นัดดูพื้นที่ และเจรจาจนจบ
            เมื่อปิดดีลได้ คุณรับค่าแนะนำตามเงื่อนไขของแปลงนั้น ไม่ต้องมีใบอนุญาตนายหน้า
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#partner-form" className="btn-gold px-8 py-4 text-lg">สมัครผู้แนะนำ ฟรี</a>
            <Link href="/how-it-works" className="btn-outline border-white/30 px-8 py-4 text-lg text-white hover:bg-white/10">
              ดูขั้นตอน
            </Link>
          </div>
        </div>
      </section>

      {openListings.length > 0 && (
        <section className="section">
          <div className="container-xl">
            <h2 className="text-2xl font-black text-[#06235f]">แปลงที่เปิดรับแนะนำตอนนี้</h2>
            <p className="mt-1 text-slate-600">ค่าแนะนำที่แสดงคือยอดสูงสุดของแต่ละแปลง จ่ายเมื่อธุรกรรมสำเร็จตามเงื่อนไข</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {openListings.map((land) => <ListingCard key={land.id} land={land} {...resolveListingPresentation(land)} />)}
            </div>
          </div>
        </section>
      )}

      {/* Form + LINE */}
      <section id="partner-form" className="section bg-slate-50">
        <div className="container-xl max-w-lg">
          <div className="card p-5 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">สมัครผู้แนะนำ</h2>
            <p className="text-sm text-slate-500 text-center mb-6">
              หรือเพิ่ม LINE OA ด้านล่าง เพื่อเริ่มทันที
            </p>
            <PartnerForm />
            <div className="mt-4 text-center text-slate-400 text-xs">— หรือ —</div>
            <LineButton className="w-full justify-center mt-3" label="สมัครผ่าน LINE OA" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="container-xl max-w-2xl">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">คำถามที่พบบ่อย</h2>
          <div className="flex flex-col gap-4">
            {faqItems.map((item) => (
              <div key={item.q} className="card p-6">
                <h3 className="font-semibold text-slate-800 mb-2">{item.q}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/how-it-works" className="btn-outline">
              ดูข้อมูลเพิ่มเติม
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
