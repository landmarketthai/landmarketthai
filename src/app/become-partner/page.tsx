import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp, Users, Award } from "lucide-react";
import PartnerForm from "@/components/forms/PartnerForm";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "สมัครพาร์ทเนอร์ – หารายได้จากที่ดินอุตสาหกรรม",
  description:
    "สมัครเป็น Referral Partner กับ LandmarketThai ฟรีตลอดชีพ รับค่าแนะนำสูงสุดหลายล้านบาทต่อดีล ไม่ต้องลงทุน ไม่ต้องสต็อก",
  alternates: { canonical: "/become-partner" },
  openGraph: { url: "/become-partner" },
};

const benefits = [
  { icon: <Award size={20} />, title: "ค่าแนะนำสูงสุดหลายล้าน", desc: "ต่อดีล – จ่ายจริงเมื่อปิดดีล" },
  { icon: <Users size={20} />, title: "ไม่ต้องมีใบอนุญาต", desc: "ทุกคนสมัครได้ ทำนอกเวลาได้" },
  { icon: <TrendingUp size={20} />, title: "ทีมปิดดีลให้คุณ", desc: "แค่แนะนำ เราดูแลทุกขั้นตอน" },
];

const commissionExamples = [
  { dealValue: "50 ล้าน", commission: "500,000 – 1,500,000", landSize: "50 ไร่" },
  { dealValue: "200 ล้าน", commission: "2,000,000 – 6,000,000", landSize: "200 ไร่" },
  { dealValue: "500 ล้าน", commission: "5,000,000 – 15,000,000", landSize: "500 ไร่" },
];

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
    a: "ได้ครับ! แนะนำผู้ซื้อ (Buyer Referral) ก็รับค่าคอมได้เช่นกัน",
  },
  {
    q: "ทำงานร่วมกับที่ดินหลายแปลงได้ไหม?",
    a: "ได้ ไม่มีขีดจำกัด ยิ่งแนะนำมาก ยิ่งรับมาก",
  },
];

export default function BecomePartnerPage() {
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
      <section className="bg-gradient-to-br from-slate-950 to-brand-900 text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="container-xl text-center max-w-3xl mx-auto flex flex-col gap-6">
          <div className="inline-flex items-center gap-2 bg-brand-500/20 text-brand-300 text-xs px-4 py-1.5 rounded-full border border-brand-500/30 mx-auto">
            💰 สมัครฟรี – รับค่าคอมจริง
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold">
            เปลี่ยน Connection <span className="text-brand-400">เป็นรายได้</span>
          </h1>
          <p className="text-slate-300 text-lg">
            แนะนำที่ดินหรือผู้ซื้อ รับค่าคอมสูงสุดหลายล้านบาทต่อดีล
            ทีมเราดูแลทุกขั้นตอน คุณแค่ส่งต่อ Connection
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#partner-form" className="btn-gold text-lg px-8 py-4">
              สมัครเลย – ฟรีตลอดชีพ
            </a>
            <Link href="/how-it-works" className="btn-outline border-white/30 text-white hover:bg-white/10 text-lg px-8 py-4">
              ดูวิธีทำงาน
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section bg-slate-50">
        <div className="container-xl">
          <div className="grid sm:grid-cols-3 gap-6">
            {benefits.map((b) => (
              <div key={b.title} className="card p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
                  {b.icon}
                </div>
                <h3 className="font-semibold text-slate-900">{b.title}</h3>
                <p className="text-sm text-slate-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission examples */}
      <section className="section">
        <div className="container-xl max-w-3xl">
          <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">ตัวอย่างค่าแนะนำ</h2>
          <p className="text-slate-500 text-sm text-center mb-8">ค่าแนะนำจริงขึ้นอยู่กับมูลค่าดีลและเงื่อนไข</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-6 py-4 text-left font-medium">ขนาดที่ดิน</th>
                  <th className="px-6 py-4 text-left font-medium">มูลค่าดีล</th>
                  <th className="px-6 py-4 text-left font-medium text-green-700">ค่าแนะนำ (โดยประมาณ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commissionExamples.map((row) => (
                  <tr key={row.dealValue} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">{row.landSize}</td>
                    <td className="px-6 py-4 text-slate-600">{row.dealValue} บาท</td>
                    <td className="px-6 py-4 font-semibold text-green-700">{row.commission} บาท</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Form + LINE */}
      <section id="partner-form" className="section bg-slate-50">
        <div className="container-xl max-w-lg">
          <div className="card p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">สมัครพาร์ทเนอร์</h2>
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
