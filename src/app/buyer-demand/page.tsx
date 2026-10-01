import type { Metadata } from "next";
import Link from "next/link";
import { getActiveDemands } from "@/lib/neon/queries";
import BuyerDemandList from "@/components/demand/BuyerDemandList";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Buyer กำลังหาที่ดิน – ตลาดย้อนกลับ LandmarketThai",
  description:
    "รายการ Buyer ที่กำลังมองหาที่ดินอุตสาหกรรม EEC ระยอง ชลบุรี คุณมีที่ดินตรงนี้ไหม? แนะนำได้ทันที",
  alternates: { canonical: "/buyer-demand" },
};

export default async function BuyerDemandPage() {
  const demands = await getActiveDemands(50).catch(() => []);

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: demands.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `/buyer-demand/${d.slug}`,
    })),
  };

  return (
    <div>
      <JsonLd data={listSchema} />

      <div className="bg-slate-900 text-white py-14 px-4 sm:px-6 lg:px-8">
        <div className="container-xl max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-300 text-xs px-4 py-1.5 rounded-full border border-green-500/30 mb-4">
            🔍 Buyer กำลังหาที่ดิน
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">ตลาดย้อนกลับ</h1>
          <p className="text-slate-400">
            รายการผู้ซื้อที่ต้องการที่ดินอุตสาหกรรม EEC
            คุณรู้จักที่ดินที่ตรงกับความต้องการ? แนะนำเพื่อรับค่าคอม
          </p>
        </div>
      </div>

      <div className="container-xl section">
        <BuyerDemandList
          demands={demands}
          emptyAction={
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/buy-request" className="btn-green">ฝากความต้องการซื้อ</Link>
              <LineButton label="ติดต่อผ่าน LINE OA" />
            </div>
          }
        />

        <div className="mt-12 text-center bg-brand-50 rounded-2xl p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">คุณรู้จักที่ดินที่ตรงกับ Buyer ไหม?</h2>
          <p className="text-slate-500 text-sm mb-5">
            แนะนำที่ดินให้ตรงกับ Buyer รับค่าแนะนำเมื่อปิดดีล
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/submit-land" className="btn-primary">ส่งข้อมูลที่ดิน</Link>
            <Link href="/become-partner" className="btn-outline">สมัครพาร์ทเนอร์</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
