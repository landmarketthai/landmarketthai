import type { Metadata } from "next";
import { CheckCircle2, FileCheck, Save, Shield } from "lucide-react";
import SellWizard from "@/components/forms/SellWizard";
import { getPersistedProvinces } from "@/lib/neon/queries";

export const metadata: Metadata = {
  title: "ฝากขายทรัพย์",
  description: "ฝากขายที่ดิน บ้าน คอนโด อาคารพาณิชย์ โรงงาน โกดัง และอสังหาริมทรัพย์อื่น ข้อมูลจะผ่านการตรวจสอบก่อนเผยแพร่",
  alternates: { canonical: "/sell" },
};

const notes = [
  { Icon: Save, text: "บันทึกแบบร่างอัตโนมัติ กลับมาทำต่อได้" },
  { Icon: Shield, text: "ข้อมูลจะไม่เผยแพร่อัตโนมัติ" },
  { Icon: FileCheck, text: "ทีมงานตรวจสอบก่อนขึ้นเว็บไซต์" },
  { Icon: CheckCircle2, text: "กรอกเฉพาะข้อมูลจริงที่มีอยู่" },
];

export default async function SellPage({ searchParams }: { searchParams: Promise<{ buyer_demand?: string }> }) {
  const reference = (await searchParams).buyer_demand;
  const buyerDemandSlug = typeof reference === "string" && /^buyer-demand-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference) ? reference : undefined;
  // property_submissions.province_id is a UUID FK, so only offer persisted provinces (never seed placeholders).
  const provinces = await getPersistedProvinces().catch(() => []);

  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl max-w-3xl text-center">
          <div className="text-xs font-bold tracking-[0.16em] text-gold-400">SELL</div>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">ฝากขายทรัพย์</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">
            กรอกข้อมูลทรัพย์ในหน้าเดียว ระบบบันทึกแบบร่างให้อัตโนมัติ กลับมาทำต่อได้
            และทีมงานจะตรวจสอบก่อนเผยแพร่ทุกครั้ง
          </p>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="container-xl max-w-5xl">
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {notes.map(({ Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={18} />
                </span>
                <span className="pt-1 text-sm font-medium leading-5 text-slate-700">{text}</span>
              </div>
            ))}
          </div>
          {buyerDemandSlug && <p className="mb-4 break-words [overflow-wrap:anywhere] text-sm text-slate-600">แนะนำทรัพย์สำหรับความต้องการซื้อ: {buyerDemandSlug}</p>}
          <SellWizard provinces={provinces} buyerDemandSlug={buyerDemandSlug} />
        </div>
      </section>
    </main>
  );
}
