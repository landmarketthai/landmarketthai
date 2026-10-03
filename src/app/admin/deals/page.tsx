import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { dealFiltersSchema, firstParams } from "@/lib/operations/schemas";
import { DEAL_LIST_LIMIT, getAssignees, listDeals } from "@/lib/operations/queries";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STATUSES, DEAL_STATUS_LABELS, summarizeDeals } from "@/lib/operations/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "ดีล", robots: { index: false, follow: false } };

const baht = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });

export default async function AdminDealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/deals");
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  const parsed = dealFiltersSchema.safeParse(firstParams(await searchParams));
  const filters = parsed.success ? parsed.data : {};
  const [deals, assignees] = await Promise.all([listDeals(filters).catch(() => null), getAssignees().catch(() => [])]);
  const summary = deals ? summarizeDeals(deals) : null;
  return <main className="container-xl section">
    <nav className="flex flex-wrap gap-4 text-sm text-brand-600"><Link href="/admin/leads">ลีด CRM →</Link></nav>
    <h1 className="mt-4 text-3xl font-bold">ไปป์ไลน์ดีล</h1>
    <p className="mt-2 text-sm text-slate-600">สร้างดีลจากหน้ารายละเอียดลีดผู้ซื้อ</p>
    {!parsed.success && <p role="alert" className="mt-3 text-sm text-amber-800">ตัวกรองไม่ถูกต้อง แสดงรายการทั้งหมดแทน</p>}
    <form method="get" className="my-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="min-w-0"><span className="label">ผู้รับผิดชอบ</span><select name="assigned_to" className="input" defaultValue={filters.assigned_to ?? ""}><option value="">ทั้งหมด</option><option value="__none">ยังไม่มี</option>{assignees.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="min-w-0"><span className="label">สถานะ</span><select name="status" className="input" defaultValue={filters.status ?? ""}><option value="">ทั้งหมด</option>{DEAL_STATUSES.map((value) => <option key={value} value={value}>{DEAL_STATUS_LABELS[value]}</option>)}</select></label>
      <button className="btn-outline min-h-11">กรอง</button>
    </form>
    {!deals || !summary ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700"><p>โหลดดีลไม่สำเร็จ กรุณาลองอีกครั้ง</p><Link href="/admin/deals" className="mt-3 inline-block underline">โหลดใหม่</Link></div> : <>
      <dl className="my-5 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        {[["ดีลที่เปิดอยู่", summary.open.count.toLocaleString("th-TH")], ["มูลค่าไปป์ไลน์ (บาท)", baht(summary.open.value)],
          ["ปิดสำเร็จ", summary.won.count.toLocaleString("th-TH")], ["มูลค่าปิดสำเร็จ (บาท)", baht(summary.won.value)]].map(([label, value]) =>
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><dt className="text-slate-500">{label}</dt><dd className="text-2xl font-bold">{value}</dd></div>)}
      </dl>
      {deals.length >= DEAL_LIST_LIMIT && <p className="mb-3 text-sm text-amber-800">แสดง {DEAL_LIST_LIMIT} ดีลล่าสุดเท่านั้น ใช้ตัวกรองเพื่อจำกัดรายการ</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:overflow-x-auto lg:pb-2">
        {DEAL_STAGES.map((stage) => {
          const bucket = summary.byStage[stage];
          return <section key={stage} aria-label={DEAL_STAGE_LABELS[stage]} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:w-64 lg:shrink-0">
            <h2 className="font-semibold">{DEAL_STAGE_LABELS[stage]} <span className="text-slate-500">({bucket.count})</span></h2>
            <p className="text-xs text-slate-500">มูลค่า {baht(bucket.value)} · คอมฯ คาด {baht(bucket.commission)}</p>
            <ul className="mt-3 space-y-2">
              {bucket.deals.map((deal) => <li key={deal.id}><Link href={`/admin/deals/${deal.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 text-sm hover:border-brand-500">
                <span className="block break-words font-semibold">{deal.listing_title ?? deal.listing_ref ?? deal.id.slice(0, 8)}</span>
                <span className="block break-words text-slate-600">{deal.buyer_name ?? "ไม่มีลีดผู้ซื้อ"}{deal.partner_name ? ` · แนะนำโดย ${deal.partner_name}` : ""}</span>
                <span className="block text-slate-500">{deal.deal_value != null ? `${baht(deal.deal_value)} บาท` : "ยังไม่ระบุมูลค่า"} · {deal.assigned_to ?? "ยังไม่มีผู้รับผิดชอบ"}</span>
              </Link></li>)}
              {!bucket.deals.length && <li className="text-xs text-slate-400">ไม่มีดีล</li>}
            </ul>
          </section>;
        })}
      </div>
    </>}
  </main>;
}
