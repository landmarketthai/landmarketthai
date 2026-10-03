import type { Metadata } from "next";
import { Phone, MessageCircle, MapPin } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import LeadForm from "@/components/forms/LeadForm";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description: "ติดต่อทีม LandmarketThai สอบถามที่ดินอุตสาหกรรม EEC สมัครพาร์ทเนอร์ หรือส่งที่ดินของคุณ",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact" },
};

const contactItems = [
  {
    icon: <MessageCircle size={20} />,
    label: "LINE OA (ช่องทางหลัก)",
    value: "@landmarketthai",
    href: process.env.NEXT_PUBLIC_LINE_OA_URL ?? "https://lin.ee/8p064f7",
    note: "เพิ่ม LINE OA เพื่อรับข้อมูลที่ดิน นัดหมายเข้าชมพื้นที่ และสอบถามรายละเอียดเพิ่มเติม",
    primary: true,
  },
  {
    icon: <Phone size={20} />,
    label: "โทรศัพท์ (ตามการนัดหมาย)",
    value: "นัดหมายผ่าน LINE OA ก่อนโทร",
    href: null,
    note: "สำหรับผู้ที่ได้รับการติดต่อจากทีมงานแล้ว หรือต้องการนัดหมายโดยตรง",
  },
  {
    icon: <MapPin size={20} />,
    label: "พื้นที่ให้บริการ",
    value: "EEC · ระยอง · ชลบุรี · ฉะเชิงเทรา · สมุทรปราการ",
    href: null,
    note: null,
  },
];

export default function ContactPage() {
  return (
    <div>
      <div className="bg-slate-900 px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-8">
        <div className="container-xl max-w-2xl">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">ติดต่อเรา</h1>
          <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
            ติดต่อผ่าน LINE OA เพื่อรับข้อมูลที่ดิน นัดหมายเข้าชมพื้นที่ หรือฝากข้อมูลให้ทีมงานติดต่อกลับ
          </p>
        </div>
      </div>

      <div className="container-xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid max-w-4xl gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Contact info */}
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="mb-2 text-lg font-semibold text-slate-800">ช่องทางติดต่อ</h2>
              <p className="text-sm text-slate-500">
                LINE OA เป็นช่องทางที่เร็วที่สุดสำหรับการส่งข้อมูลที่ดินและนัดหมาย
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {contactItems.map((item) => (
                <div
                  key={item.label}
                  className={`card flex min-w-0 items-start gap-3 p-4 sm:gap-4 ${
                    item.primary ? "border-brand-200 bg-brand-50/70" : ""
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      item.primary ? "bg-brand-500 text-white" : "bg-brand-100 text-brand-600"
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 mb-0.5">{item.label}</div>
                    {item.href ? (
                      <a href={item.href} className="wrap-break-word font-medium text-slate-800 transition-colors hover:text-brand-600">
                        {item.value}
                      </a>
                    ) : (
                      <span className="wrap-break-word font-medium text-slate-800">{item.value}</span>
                    )}
                    {item.note && <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.note}</p>}
                  </div>
                </div>
              ))}
            </div>

            <LineButton
              className="w-full justify-center"
              size="lg"
              label="เพิ่ม LINE OA"
            />
          </div>

          {/* Quick contact form */}
          <div className="card p-4 sm:p-8">
            <h2 className="mb-1 text-lg font-semibold text-slate-800">ส่งข้อความหาเรา</h2>
            <p className="mb-5 text-sm leading-relaxed text-slate-500">
              ฝากชื่อ เบอร์โทร และ LINE ID ทีมงานจะติดต่อกลับเพื่อคัดกรองความต้องการเบื้องต้น
            </p>
            <LeadForm defaultType="buyer" heading="ส่งข้อมูลติดต่อ" submitLabel="ส่งข้อมูลติดต่อ" />
          </div>
        </div>
      </div>
    </div>
  );
}
