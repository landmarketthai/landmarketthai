import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import JsonLd from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "วิธีรับค่าแนะนำ – Referral Partner",
  description:
    "วิธีทำงานของระบบ Referral Partner LandmarketThai สมัครฟรี แนะนำที่ดินหรือผู้ซื้อ รับค่าคอมเมื่อปิดดีล",
  alternates: { canonical: "/how-it-works" },
  openGraph: { url: "/how-it-works" },
};

const steps = [
  {
    num: "01",
    title: "สมัครพาร์ทเนอร์ฟรี",
    desc: "กรอกข้อมูลออนไลน์หรือเพิ่ม LINE OA ทีมเราจะส่ง referral code และลิสต์ที่ดินให้คุณ",
    details: [
      "ไม่มีค่าสมัคร",
      "ไม่ต้องมีใบอนุญาต",
      "ทำเป็นอาชีพเสริมได้",
    ],
  },
  {
    num: "02",
    title: "แนะนำที่ดินหรือผู้ซื้อ",
    desc: "ถ้าคุณรู้จักที่ดินในพื้นที่ — ส่งข้อมูลให้เรา ถ้าคุณรู้จักนักลงทุนหรือโรงงานที่ต้องการที่ดิน — แนะนำมา",
    details: [
      "ส่งผ่าน LINE หรือฟอร์มออนไลน์",
      "ใช้ referral code ส่วนตัวของคุณ",
      "ทีมเราจะ follow up ทุกอย่าง",
    ],
  },
  {
    num: "03",
    title: "รับค่าแนะนำเมื่อปิดดีล",
    desc: "ทีม LandmarketThai ดูแลการประสานงาน การเจรจา และเอกสาร เมื่อธุรกรรมสำเร็จจะดำเนินการจ่ายค่าตอบแทนตามเงื่อนไขของดีล",
    details: [
      "จ่ายผ่านธนาคาร พร้อมหลักฐาน",
      "อัตราค่าตอบแทนเป็นไปตามเงื่อนไขของแต่ละดีล",
      "ติดตามสถานะผ่าน LINE",
    ],
  },
];

const eligibility = [
  "คนท้องถิ่นที่รู้จักที่ดินในพื้นที่",
  "โบรกเกอร์อสังหาริมทรัพย์",
  "ผู้รับเหมาก่อสร้างและช่างสำรวจ",
  "นักลงทุนที่มีเครือข่ายธุรกิจ",
  "พนักงานนิคมอุตสาหกรรม",
  "ทุกคนที่มี Connection ในวงการอุตสาหกรรม",
];

export default function HowItWorksPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "ใครสมัครพาร์ทเนอร์ได้บ้าง?",
        acceptedAnswer: { "@type": "Answer", text: "ทุกคนที่บรรลุนิติภาวะ ไม่ต้องมีใบอนุญาต ไม่จำกัดอาชีพ" },
      },
      {
        "@type": "Question",
        name: "รับค่าแนะนำเท่าไหร่?",
        acceptedAnswer: { "@type": "Answer", text: "อัตราค่าตอบแทนขึ้นอยู่กับเงื่อนไขของแต่ละดีล โดยทีมงานจะแจ้งรายละเอียดก่อนดำเนินการ" },
      },
    ],
  };

  return (
    <div>
      <JsonLd data={faqSchema} />

      <div className="bg-slate-900 text-white py-14 px-4 sm:px-6 lg:px-8">
        <div className="container-xl text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">วิธีรับค่าแนะนำ</h1>
          <p className="text-slate-400">
            ระบบ Referral Partner ของ LandmarketThai ออกแบบให้เรียบง่าย
            คุณแนะนำ เราปิดดีล คุณรับเงิน
          </p>
        </div>
      </div>

      {/* Steps */}
      <section className="section">
        <div className="container-xl max-w-3xl">
          <div className="flex flex-col gap-8">
            {steps.map((step, i) => (
              <div key={step.num} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-brand-500 text-white flex items-center justify-center font-bold shrink-0">
                    {step.num}
                  </div>
                  {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 mt-3" />}
                </div>
                <div className="pb-8">
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h2>
                  <p className="text-slate-500 mb-4 leading-relaxed">{step.desc}</p>
                  <ul className="space-y-1.5">
                    {step.details.map((d) => (
                      <li key={d} className="flex items-center gap-2 text-sm text-slate-600">
                        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="section bg-slate-50">
        <div className="container-xl max-w-2xl">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">ใครเป็นพาร์ทเนอร์ได้?</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {eligibility.map((item) => (
              <div key={item} className="flex items-center gap-3 card p-4">
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                <span className="text-sm text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section bg-brand-600 text-white">
        <div className="container-xl text-center max-w-lg">
          <h2 className="text-2xl font-bold mb-3">พร้อมเริ่มต้นแล้วใช่ไหม?</h2>
          <p className="text-brand-100 mb-6">สมัครฟรี รับ referral code ส่วนตัว เริ่มแนะนำได้เลย</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/become-partner" className="btn-primary bg-white text-brand-700 hover:bg-brand-50 text-lg px-8 py-4">
              สมัครพาร์ทเนอร์
              <ArrowRight size={18} />
            </Link>
            <LineButton label="สมัครผ่าน LINE" size="lg" />
          </div>
        </div>
      </section>
    </div>
  );
}
