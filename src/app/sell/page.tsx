import type { Metadata } from "next";
import SellWizard from "@/components/forms/SellWizard";
import { getPersistedProvinces } from "@/lib/neon/queries";

export const metadata: Metadata = {
  title: "ฝากขายทรัพย์",
  description: "ฝากขายอสังหาริมทรัพย์ทุกประเภท ข้อมูลจะผ่านการตรวจสอบก่อนเผยแพร่",
  alternates: { canonical: "/sell" },
  openGraph: { url: "/sell" },
};

export default async function SellPage({ searchParams }: { searchParams: Promise<{ buyer_demand?: string }> }) {
  const reference = (await searchParams).buyer_demand;
  const buyerDemandSlug = typeof reference === "string" && /^buyer-demand-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference) ? reference : undefined;
  // property_submissions.province_id is a UUID FK, so only offer persisted provinces (never seed placeholders).
  const provinces = await getPersistedProvinces().catch(() => []);

  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-7 text-white sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl max-w-3xl text-center">
          <h1 className="text-2xl font-black sm:text-4xl">ฝากขายที่ดินกับเรา</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">
            ส่งข้อมูลครั้งเดียว ทีมงานตรวจสอบและเสนอต่อผู้ซื้อและเครือข่ายผู้แนะนำให้ ระบบบันทึกแบบร่างอัตโนมัติ
          </p>
        </div>
      </section>

      <section className="px-4 pb-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl max-w-4xl">
          {buyerDemandSlug && <p className="mb-4 break-words [overflow-wrap:anywhere] text-sm text-slate-600">แนะนำทรัพย์สำหรับความต้องการซื้อ: {buyerDemandSlug}</p>}
          <SellWizard provinces={provinces} buyerDemandSlug={buyerDemandSlug} />
        </div>
      </section>
    </main>
  );
}
