import type { Metadata } from "next";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { getActiveDemands } from "@/lib/neon/queries";
import { LAND_TYPE_LABELS } from "@/lib/utils";
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
        {demands.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl">
            <div className="text-4xl mb-4">🔍</div>
            <h2 className="text-lg font-semibold text-slate-700 mb-2">กำลังอัปเดตรายการ Buyer</h2>
            <p className="text-slate-500 text-sm mb-6">ติดต่อเราเพื่อรับข้อมูล Buyer ล่าสุด</p>
            <LineButton label="ติดต่อผ่าน LINE OA" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {demands.map((d) => (
              <Link
                key={d.id}
                href={`/buyer-demand/${d.slug}`}
                className="card p-6 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1">
                      {d.province?.name_th ?? "ทุกพื้นที่"}
                      {d.land_type ? ` · ${LAND_TYPE_LABELS[d.land_type]}` : ""}
                    </div>
                    <div className="font-semibold text-slate-800 group-hover:text-brand-600 transition-colors">
                      ต้องการ{" "}
                      {d.size_min_rai && d.size_max_rai
                        ? `${d.size_min_rai}–${d.size_max_rai} ไร่`
                        : d.size_min_rai
                        ? `${d.size_min_rai}+ ไร่`
                        : "ทุกขนาด"}
                    </div>
                  </div>
                </div>

                {d.intended_use && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{d.intended_use}</p>
                )}
                {d.budget_note && (
                  <div className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                    งบประมาณ: {d.budget_note}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-1 text-xs text-brand-600 font-medium">
                  แนะนำที่ดินนี้
                  <ArrowRight size={12} />
                </div>
              </Link>
            ))}
          </div>
        )}

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
