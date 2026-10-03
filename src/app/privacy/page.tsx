import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  description: "นโยบายความเป็นส่วนตัวของ LandmarketThai การเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล PDPA Compliant",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="container-xl section max-w-3xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">นโยบายความเป็นส่วนตัว</h1>
      <p className="text-slate-500 text-sm mb-8">อัปเดตล่าสุด: มิถุนายน 2025 | เป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) พ.ศ. 2562</p>

      <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2>1. ผู้ควบคุมข้อมูลส่วนบุคคล</h2>
          <p>
            LandmarketThai (&quot;บริษัท&quot;, &quot;เรา&quot;) เป็นผู้ควบคุมข้อมูลส่วนบุคคลตามนโยบายนี้
            ติดต่อผ่านอีเมล contact@landmarketthai.com
          </p>
        </section>

        <section>
          <h2>2. ข้อมูลที่เราเก็บรวบรวม</h2>
          <ul>
            <li><strong>ข้อมูลติดต่อ:</strong> ชื่อ เบอร์โทร LINE ID อีเมล</li>
            <li><strong>ข้อมูลที่ดิน:</strong> จังหวัด พื้นที่ ราคา ประเภทเอกสารสิทธิ์</li>
            <li><strong>เอกสาร:</strong> โฉนดที่ดิน แผนที่ รูปภาพที่ดิน (สำหรับเจ้าของที่ดิน)</li>
            <li><strong>ข้อมูลการใช้งาน:</strong> IP address, session data, การใช้งานเว็บไซต์</li>
          </ul>
        </section>

        <section>
          <h2>3. วัตถุประสงค์การใช้ข้อมูล</h2>
          <ul>
            <li>ติดต่อกลับเพื่อให้บริการด้านที่ดิน</li>
            <li>ประสานงานระหว่างเจ้าของที่ดินและผู้ซื้อ</li>
            <li>บริหารจัดการโปรแกรม Referral Partner</li>
            <li>ปรับปรุงบริการและประสบการณ์ผู้ใช้</li>
            <li>ปฏิบัติตามข้อกำหนดทางกฎหมาย</li>
          </ul>
        </section>

        <section>
          <h2>4. การเก็บรักษาและความปลอดภัย</h2>
          <p>
            เอกสารสิทธิ์และข้อมูลที่ดินจัดเก็บในระบบ Private Cloud Storage ที่เข้ารหัส
            ไม่สามารถเข้าถึงได้จากสาธารณะ เข้าถึงได้เฉพาะพนักงาน LandmarketThai ที่ได้รับอนุญาต
            เท่านั้น ภายใต้การยืนยันตัวตน
          </p>
        </section>

        <section>
          <h2>5. การเปิดเผยข้อมูลให้บุคคลที่สาม</h2>
          <p>
            เราจะไม่ขาย เช่า หรือเปิดเผยข้อมูลส่วนบุคคลของคุณให้บุคคลภายนอก
            ยกเว้นกรณีได้รับความยินยอมจากคุณ หรือเมื่อจำเป็นต้องปฏิบัติตามกฎหมาย
          </p>
        </section>

        <section>
          <h2>6. ระยะเวลาในการเก็บข้อมูล</h2>
          <p>
            เราเก็บข้อมูลส่วนบุคคลตราบเท่าที่จำเป็นสำหรับวัตถุประสงค์ที่ระบุ
            หรือตามที่กฎหมายกำหนด หลังจากนั้นจะลบหรือทำลายข้อมูลอย่างปลอดภัย
          </p>
        </section>

        <section>
          <h2>7. สิทธิของเจ้าของข้อมูล</h2>
          <p>คุณมีสิทธิ์ดังต่อไปนี้ตาม PDPA:</p>
          <ul>
            <li>สิทธิ์เข้าถึงข้อมูล (Right to Access)</li>
            <li>สิทธิ์แก้ไขข้อมูล (Right to Rectification)</li>
            <li>สิทธิ์ลบข้อมูล (Right to Erasure)</li>
            <li>สิทธิ์คัดค้านการประมวลผล (Right to Object)</li>
            <li>สิทธิ์ขอโอนย้ายข้อมูล (Right to Data Portability)</li>
          </ul>
          <p>ติดต่อใช้สิทธิ์ได้ที่ contact@landmarketthai.com</p>
        </section>

        <section>
          <h2>8. คุกกี้</h2>
          <p>
            เว็บไซต์ใช้คุกกี้เพื่อวิเคราะห์การใช้งาน (Google Analytics)
            คุณสามารถปิดคุกกี้ได้ผ่านการตั้งค่าเบราว์เซอร์
          </p>
        </section>

        <section>
          <h2>9. การเปลี่ยนแปลงนโยบาย</h2>
          <p>
            เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว การเปลี่ยนแปลงสำคัญจะแจ้งให้ทราบผ่านเว็บไซต์หรือ LINE OA
          </p>
        </section>

        <section>
          <h2>10. ติดต่อเรา</h2>
          <p>
            หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว ติดต่อได้ที่{" "}
            <a href="mailto:contact@landmarketthai.com" className="text-brand-600 underline">
              contact@landmarketthai.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
