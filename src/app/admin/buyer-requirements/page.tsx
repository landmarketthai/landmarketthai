import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { getBuyerRequirements } from "@/lib/neon/marketplace";
import { getAllProvinces } from "@/lib/neon/queries";
import AdminBuyerRequirements from "@/components/admin/AdminBuyerRequirements";
import { BUYER_STATUS_LABELS } from "@/lib/marketplace/buyer-demand-workflow";
import type { BuyerRequirementStatus } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "ตรวจสอบความต้องการซื้อ", robots: { index: false, follow: false } };

export default async function AdminBuyerRequirementsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string; id?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/buyer-requirements");
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  const params = await searchParams;
  const raw = Number(params.page ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 && raw <= Math.floor(Number.MAX_SAFE_INTEGER / 50) ? raw : 1;
  const status = typeof params.status === "string" ? params.status : "";
  const id = typeof params.id === "string" ? params.id.trim() : "";
  const href = (value: number) => `/admin/buyer-requirements?${new URLSearchParams({ page: String(value), status, id })}`;
  const [requirements, provinces] = await Promise.all([
    getBuyerRequirements((page - 1) * 50, status, id).catch(() => null),
    getAllProvinces().catch(() => []),
  ]);
  return <main className="container-xl section">
    <Link href="/admin/properties" className="text-sm text-brand-600">ตรวจสอบทรัพย์ →</Link>
    <h1 className="mt-4 text-3xl font-bold">ตรวจสอบความต้องการซื้อ</h1>
    <p className="my-4 text-sm text-slate-600">ข้อมูลนี้เป็นส่วนตัว อนุมัติแล้วก็ยังไม่เผยแพร่ ต้องกดเผยแพร่แยกและมีความยินยอมสาธารณะ จับคู่แล้วหยุดเผยแพร่ ปิดแล้วสิ้นสุดความต้องการ</p>
    <form method="get" className="my-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
      <label className="min-w-0"><span className="label">สถานะ</span><select name="status" className="input" defaultValue={status}><option value="">ทั้งหมด</option>{(Object.keys(BUYER_STATUS_LABELS) as BuyerRequirementStatus[]).map((value) => <option key={value} value={value}>{BUYER_STATUS_LABELS[value]}</option>)}</select></label>
      <label className="min-w-0"><span className="label">ค้นหาด้วย UUID</span><input name="id" className="input" defaultValue={id} autoComplete="off" spellCheck={false} /></label>
      <button className="btn-outline min-h-11">ค้นหา</button>
    </form>
    {requirements ? <AdminBuyerRequirements requirements={requirements.slice(0, 50)} provinces={provinces} /> : <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
      <p>โหลดความต้องการซื้อไม่สำเร็จ กรุณาลองอีกครั้ง</p>
      <Link href="/admin/buyer-requirements" className="mt-3 inline-block underline">โหลดรายการใหม่</Link>
    </div>}
    {requirements && <nav aria-label="หน้ารายการ" className="mt-6 flex flex-wrap items-center gap-4">
      <span className="text-sm text-slate-600">หน้า {page}</span>
      {page > 1 && <Link href={href(page - 1)} className="btn-outline">ก่อนหน้า</Link>}
      {requirements.length > 50 && <Link href={href(page + 1)} className="btn-outline">ถัดไป</Link>}
    </nav>}
  </main>;
}
