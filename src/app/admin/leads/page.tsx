import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { firstParams, leadFiltersSchema } from "@/lib/operations/schemas";
import { getAssignees, getLeadSummary, listLeads, PAGE_SIZE } from "@/lib/operations/queries";
import { formatBangkok, isLeadOverdue, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_TYPES, LEAD_TYPE_LABELS } from "@/lib/operations/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "ลีด CRM", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/leads");
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  const raw = firstParams(await searchParams);
  const parsed = leadFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : {};
  const page = filters.page ?? 1;
  const query = (patch: Record<string, string>) => `/admin/leads?${new URLSearchParams({ ...(parsed.success ? raw : {}), ...patch })}`;
  const [leads, summary, assignees] = await Promise.all([
    listLeads(filters).catch(() => null),
    getLeadSummary().catch(() => null),
    getAssignees().catch(() => []),
  ]);
  const now = Date.now();
  return <main className="container-xl section">
    <nav className="flex flex-wrap gap-4 text-sm text-brand-600"><Link href="/admin/deals">ดีล →</Link><Link href="/admin/buyer-requirements">ความต้องการซื้อ →</Link></nav>
    <h1 className="mt-4 text-3xl font-bold">ลีด CRM</h1>
    {!parsed.success && <p role="alert" className="mt-3 text-sm text-amber-800">ตัวกรองไม่ถูกต้อง แสดงรายการทั้งหมดแทน</p>}
    {summary && <dl className="my-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
      {[
        ["ทั้งหมด", summary.total, "/admin/leads"],
        ...LEAD_STATUSES.map((status) => [LEAD_STATUS_LABELS[status], summary.byStatus[status] ?? 0, query({ status, page: "1" })] as const),
        ["เลยนัดติดตาม", summary.overdue, query({ overdue: "1", page: "1" })],
        ["ยังไม่มีผู้รับผิดชอบ", summary.unassigned, query({ assigned_to: "__none", page: "1" })],
      ].map(([label, count, href]) => <Link key={String(label)} href={String(href)} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-500">
        <dt className="text-slate-500">{label}</dt><dd className="text-2xl font-bold">{Number(count).toLocaleString("th-TH")}</dd>
      </Link>)}
    </dl>}
    <form method="get" className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
      <label className="min-w-0"><span className="label">ค้นหา (ชื่อ เบอร์ LINE รหัสแนะนำ หรือ UUID)</span><input name="q" className="input" defaultValue={filters.q ?? ""} autoComplete="off" /></label>
      <label className="min-w-0"><span className="label">ประเภท</span><select name="lead_type" className="input" defaultValue={filters.lead_type ?? ""}><option value="">ทั้งหมด</option>{LEAD_TYPES.map((value) => <option key={value} value={value}>{LEAD_TYPE_LABELS[value]}</option>)}</select></label>
      <label className="min-w-0"><span className="label">สถานะ</span><select name="status" className="input" defaultValue={filters.status ?? ""}><option value="">ทั้งหมด</option>{LEAD_STATUSES.map((value) => <option key={value} value={value}>{LEAD_STATUS_LABELS[value]}</option>)}</select></label>
      <label className="min-w-0"><span className="label">ผู้รับผิดชอบ</span><select name="assigned_to" className="input" defaultValue={filters.assigned_to ?? ""}><option value="">ทั้งหมด</option><option value="__none">ยังไม่มี</option>{assignees.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="min-w-0"><span className="label">เรียงตาม</span><select name="sort" className="input" defaultValue={filters.sort ?? "newest"}><option value="newest">ใหม่ล่าสุด</option><option value="next_action">นัดติดตามใกล้สุด</option></select></label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue === "1"} />เลยนัด</label>
        <button className="btn-outline min-h-11">ค้นหา</button>
      </div>
    </form>
    {!leads ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700"><p>โหลดลีดไม่สำเร็จ กรุณาลองอีกครั้ง</p><Link href="/admin/leads" className="mt-3 inline-block underline">โหลดรายการใหม่</Link></div>
      : !leads.length ? <p className="p-6 text-slate-500">ไม่พบลีดตามเงื่อนไข</p>
      : <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {leads.slice(0, PAGE_SIZE).map((lead) => {
          const overdue = isLeadOverdue(lead, now);
          return <li key={lead.id}><Link href={`/admin/leads/${lead.id}`} className="grid gap-1 p-4 hover:bg-slate-50 sm:grid-cols-[2fr_1fr_1fr_1fr] sm:items-center">
            <span className="min-w-0 break-words font-semibold">{lead.name} <span className="font-normal text-slate-500">· {LEAD_TYPE_LABELS[lead.lead_type] ?? lead.lead_type}</span></span>
            <span className="text-sm">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</span>
            <span className="min-w-0 break-words text-sm text-slate-600">{lead.assigned_to ?? "ยังไม่มีผู้รับผิดชอบ"}</span>
            <span className={`text-sm ${overdue ? "font-semibold text-red-700" : "text-slate-600"}`}>{lead.next_action_at ? `${overdue ? "เลยนัด " : "นัด "}${formatBangkok(lead.next_action_at)}` : `สร้าง ${formatBangkok(lead.created_at).slice(0, 10)}`}</span>
          </Link></li>;
        })}
      </ul>}
    {leads && <nav aria-label="หน้ารายการ" className="mt-6 flex flex-wrap items-center gap-4">
      <span className="text-sm text-slate-600">หน้า {page}</span>
      {page > 1 && <Link href={query({ page: String(page - 1) })} className="btn-outline">ก่อนหน้า</Link>}
      {leads.length > PAGE_SIZE && <Link href={query({ page: String(page + 1) })} className="btn-outline">ถัดไป</Link>}
    </nav>}
  </main>;
}
