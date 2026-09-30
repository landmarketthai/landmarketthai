import type { Metadata } from "next";
import { CheckCircle2, Search, Shield, Users } from "lucide-react";
import BuyerRequirementForm from "@/components/forms/BuyerRequirementForm";
import { getAllProvinces } from "@/lib/neon/queries";

export const metadata: Metadata = {
  title: "ฝากความต้องการซื้อทรัพย์",
  description: "แจ้งเงื่อนไขซื้อที่ดิน โรงงาน และโกดัง เพื่อจับคู่กับทรัพย์จริงในระบบ LandmarketThai",
  alternates: { canonical: "/buy-request" },
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const notes = [
  { Icon: Search, text: "เทียบกับทรัพย์จริงที่เผยแพร่อยู่" },
  { Icon: Shield, text: "ไม่สร้างระยะทางหรือข้อมูลสมมุติ" },
  { Icon: Users, text: "ทีมงานติดตามเมื่อมีทรัพย์ตรงเงื่อนไข" },
  { Icon: CheckCircle2, text: "ระบุเฉพาะเงื่อนไขที่สำคัญได้" },
];

export default async function BuyRequestPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const provinces = await getAllProvinces().catch(() => []);

  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl max-w-3xl text-center">
          <div className="text-xs font-bold tracking-[0.16em] text-gold-400">BUY</div>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">ฝากความต้องการซื้อ</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">
            แจ้งทำเล ขนาด งบประมาณ และเงื่อนไขที่ต้องการ ระบบจะเทียบกับทรัพย์จริงใน LandmarketThai
            และบันทึกไว้ให้ทีมงานติดตาม
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

          <BuyerRequirementForm
            provinces={provinces}
            initial={{
              property_type: one(raw.property_type),
              province: one(raw.province),
              min_size_rai: one(raw.min_size_rai),
              max_size_rai: one(raw.max_size_rai),
              max_price: one(raw.max_price),
              max_price_per_rai: one(raw.max_price_per_rai),
              zoning: one(raw.zoning),
            }}
          />
        </div>
      </section>
    </main>
  );
}
