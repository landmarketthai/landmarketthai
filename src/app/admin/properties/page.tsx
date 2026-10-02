import AdminSubmissions from "@/components/admin/AdminSubmissions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "ตรวจสอบทรัพย์", robots: { index: false, follow: false } };

export default async function AdminPropertiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/properties");
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  return (
    <main className="bg-slate-50">
      <section className="bg-[#071d4a] px-4 py-8 text-white sm:px-6 sm:py-10">
        <div className="container-xl">
          <div className="text-xs font-bold tracking-[0.16em] text-gold-400">PROPERTY REVIEW</div>
          <h1 className="mt-1 text-3xl font-black">ตรวจสอบทรัพย์</h1>
          <Link href="/admin/buyer-requirements" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-blue-200/40 px-4 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">ตรวจสอบความต้องการซื้อ (ส่วนตัว) →</Link>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
            รายการจากเจ้าของทรัพย์จะยังไม่เผยแพร่ จนกว่าทีมงานจะตรวจสอบ อนุมัติ และสั่งเผยแพร่
          </p>
        </div>
      </section>
      <section className="px-4 py-8 sm:px-6 sm:py-10">
        <div className="container-xl">
          <AdminSubmissions />
        </div>
      </section>
    </main>
  );
}
