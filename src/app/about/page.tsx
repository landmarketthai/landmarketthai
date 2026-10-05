import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import LineButton from "@/components/ui/LineButton";

export const metadata: Metadata = {
  title: "เกี่ยวกับเรา",
  description:
    "LandmarketThai แพลตฟอร์มค้นหาและฝากขายอสังหาริมทรัพย์ เชื่อมเจ้าของที่ดิน นักลงทุน และพาร์ทเนอร์ผ่านระบบ Referral",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about" },
};

export default function AboutPage() {
  return (
    <div>
      <div className="bg-slate-900 text-white py-14 px-4 sm:px-6 lg:px-8">
        <div className="container-xl max-w-2xl">
          <h1 className="text-3xl font-bold mb-3">เกี่ยวกับ LandmarketThai</h1>
          <p className="text-slate-400">
            แพลตฟอร์มเชื่อมต่อผู้ซื้อ ผู้ขาย และพาร์ทเนอร์อสังหาริมทรัพย์
          </p>
        </div>
      </div>

      <div className="container-xl section max-w-2xl">
        <div className="prose prose-slate max-w-none space-y-6 text-slate-600">
          <h2 className="text-xl font-bold text-slate-900">พันธกิจของเรา</h2>
          <p>
            LandmarketThai ก่อตั้งขึ้นเพื่อเป็นแพลตฟอร์มที่ดินอุตสาหกรรมและ EEC สำหรับค้นหา ฝากขาย และประสานงานผู้ซื้อและผู้ขาย
            เราเชื่อมเจ้าของที่ดิน นักลงทุน โรงงาน และคลังสินค้า เข้าด้วยกันผ่านเครือข่ายพาร์ทเนอร์ทั่วประเทศ
          </p>

          <h2 className="text-xl font-bold text-slate-900">จุดแข็งของเรา</h2>
          <ul className="space-y-2">
            <li><strong>การคัดสรรและตรวจสอบ</strong> — ทีมงานตรวจสอบประกาศก่อนเผยแพร่ ข้อมูลเอกสารสิทธิ์และผังเมืองแสดงตามประกาศ ควรตรวจสอบกับเอกสารต้นฉบับและหน่วยงานก่อนตัดสินใจ</li>
            <li><strong>เครือข่าย Referral</strong> — เครือข่ายพาร์ทเนอร์ช่วยเชื่อมโยงที่ดินกับผู้ซื้อที่ใช่</li>
            <li><strong>ความเชี่ยวชาญ EEC</strong> — ทีมงานมีประสบการณ์เฉพาะด้านที่ดินอุตสาหกรรมและ EEC โดยตรง</li>
            <li><strong>ความโปร่งใส</strong> — ราคาต่อไร่ชัดเจน ค่าแนะนำประกาศในที่สาธารณะ</li>
          </ul>

          <h2 className="text-xl font-bold text-slate-900">ผู้ดำเนินการ LandmarketThai</h2>
          <p>
            LandmarketThai ดำเนินการโดย <strong>ภัทรนาวินท์ กิจการนนท์</strong> ในฐานะบุคคลธรรมดา
            ที่อยู่ติดต่อ 9/19 ซอยทุ่งเศรษฐี 7 แขวงดอกไม้ เขตประเวศ กรุงเทพมหานคร 10250
            โทร <a href="tel:0860555595">086-055-5595</a>
          </p>

          <h2 className="text-xl font-bold text-slate-900">พื้นที่ให้บริการ</h2>
          <p>
            เราเชี่ยวชาญในพื้นที่ EEC (ระยอง ชลบุรี ฉะเชิงเทรา) และระเบียงสมุทรปราการ-บางนา พร้อมขยายไปอยุธยา
            และจังหวัดอื่นๆ ตามความต้องการของตลาด
          </p>

          <h2 className="text-xl font-bold text-slate-900">ความเป็นส่วนตัวและ PDPA</h2>
          <p>
            เราให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคล เอกสารสิทธิ์และข้อมูลที่ดินที่ได้รับจากเจ้าของ
            จัดเก็บในระบบ Private Storage ที่เข้ารหัส เข้าถึงได้เฉพาะทีมงานที่ได้รับสิทธิ์เท่านั้น
          </p>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link href="/become-partner" className="btn-primary">
            สมัครผู้แนะนำ
            <ArrowRight size={16} />
          </Link>
          <Link href="/contact" className="btn-outline">ติดต่อเรา</Link>
          <LineButton size="sm" />
        </div>
      </div>
    </div>
  );
}
