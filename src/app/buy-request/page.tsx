import type { Metadata } from "next";
import LeadForm from "@/components/forms/LeadForm";
import LineButton from "@/components/ui/LineButton";

export const metadata: Metadata = {
  title: "แจ้งความต้องการซื้อที่ดิน – LandmarketThai",
  description: "แจ้งจังหวัด ประเภทที่ดิน ขนาด และงบประมาณ เพื่อให้ทีม LandmarketThai คัดเลือกที่ดินที่เหมาะสมกับความต้องการของคุณ",
  alternates: { canonical: "/buy-request" },
};

export default function BuyRequestPage() {
  return (
    <main className="container-xl section max-w-3xl">
      <h1 className="mb-3 text-3xl font-bold text-slate-900">แจ้งความต้องการซื้อที่ดิน</h1>
      <p className="mb-6 text-slate-600">
        ระบุทำเล ขนาด และงบประมาณรวมที่ต้องการ ทีมงานจะใช้ข้อมูลนี้คัดเลือกที่ดินและติดต่อกลับ
        ข้อมูลติดต่อของคุณจะไม่ถูกแสดงบนประกาศผู้ซื้อสาธารณะ
      </p>
      <div className="card p-5 sm:p-8">
        <LeadForm defaultType="buyer" heading="ความต้องการและข้อมูลติดต่อ" submitLabel="ส่งความต้องการซื้อที่ดิน" />
      </div>
      <div className="mt-6">
        <LineButton label="สอบถามทีมงานผ่าน LINE OA" />
      </div>
    </main>
  );
}
