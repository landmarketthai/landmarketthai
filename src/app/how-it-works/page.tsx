import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    title: "สมัครผู้แนะนำ",
    desc: "กรอกฟอร์มหรือทัก LINE OA ไม่มีค่าสมัคร ไม่ต้องมีใบอนุญาตนายหน้า ทีมงานจะส่งรายการแปลงที่เปิดรับแนะนำพร้อมเงื่อนไขให้",
  },
  {
    title: "ส่งชื่อผู้ซื้อหรือเจ้าของที่ดิน",
    desc: "รู้จักโรงงานหรือนักลงทุนที่กำลังหาที่ดิน หรือรู้จักเจ้าของที่ดินที่อยากขาย ส่งข้อมูลผ่าน LINE หรือฟอร์ม ทีมงานติดต่อ นัดดูพื้นที่ และเจรจาต่อเอง",
  },
  {
    title: "ปิดดีลแล้วรับค่าแนะนำ",
    desc: "เมื่อธุรกรรมสำเร็จ ทีมงานจ่ายค่าแนะนำผ่านบัญชีธนาคารพร้อมหลักฐาน ตามเงื่อนไขของแปลงนั้น ติดตามสถานะได้ทาง LINE",
  },
];

export default function HowItWorksPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "ใครสมัครผู้แนะนำได้บ้าง?",
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

      <section className="bg-[#071d4a] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="container-xl mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-black sm:text-4xl">วิธีรับค่าแนะนำ</h1>
          <p className="mt-3 text-blue-100">คุณแนะนำ ทีมงานดูแลจนปิดดีล คุณรับค่าแนะนำ</p>
        </div>
      </section>

      <section className="section">
        <ol className="container-xl max-w-3xl space-y-10">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400 text-lg font-black text-[#071d4a]">{index + 1}</span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{step.title}</h2>
                <p className="mt-2 leading-relaxed text-slate-600">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="container-xl mt-12 max-w-3xl rounded-xl bg-slate-50 p-5 text-slate-600">
          <strong className="text-slate-900">ใครเป็นผู้แนะนำได้:</strong> นายหน้า คนในพื้นที่ ผู้รับเหมา พนักงานนิคมอุตสาหกรรม
          หรือใครก็ตามที่รู้จักคนกำลังซื้อหรือขายที่ดินอุตสาหกรรม
        </p>
      </section>

      <section className="section bg-[#071d4a] text-white">
        <div className="container-xl max-w-lg text-center">
          <h2 className="text-2xl font-black">เริ่มแนะนำได้วันนี้</h2>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/become-partner" className="btn-gold px-8 py-4 text-lg">
              สมัครผู้แนะนำ <ArrowRight size={18} />
            </Link>
            <LineButton label="สมัครผ่าน LINE" size="lg" />
          </div>
        </div>
      </section>
    </div>
  );
}
