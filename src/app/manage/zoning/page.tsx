import { redirect, notFound } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { getZoningManagementListings } from "@/lib/neon/queries";
import ZoningManager from "./ZoningManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการผังเมือง", robots: { index: false, follow: false } };

export default async function ZoningManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/manage/zoning");
  if (!isAdminUserAllowed(user)) notFound();
  let listings;
  try { listings = await getZoningManagementListings(); }
  catch { return <main className="container-xl section"><p role="alert">เปิดข้อมูลไม่ได้ ตรวจการเชื่อมต่อฐานข้อมูลและ migration zoning ก่อนใช้งาน</p></main>; }
  if (!listings.length) return <main className="container-xl section">ยังไม่มีประกาศในฐานข้อมูล</main>;
  return <main className="container-xl section max-w-4xl">
    <h1 className="mb-3 text-2xl font-bold">จัดการข้อมูลผังเมือง</h1>
    <p className="mb-6 text-sm text-slate-600">ข้อมูลจากฐานข้อมูลที่เซิร์ฟเวอร์เชื่อมต่อ การบันทึกเปลี่ยนข้อมูลประกาศและแบบส่งข้อมูลที่เชื่อมกัน พร้อมคืนสถานะตรวจประกาศเป็นรอตรวจ หากมีการเปลี่ยนผังเมือง ต้องตรวจหลักฐานก่อนระบุสถานะยืนยัน</p>
    <ZoningManager listings={listings} />
  </main>;
}
