import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { uuidSchema } from "@/lib/operations/schemas";
import { getAssignees, getLead, type CrmLogEntry } from "@/lib/operations/queries";
import { DEAL_STAGE_LABELS, formatBangkok, isLeadOverdue, LEAD_STATUS_LABELS, LEAD_TYPE_LABELS } from "@/lib/operations/rules";
import { DealCreateForm, LeadCrmForm } from "@/components/admin/OperationsForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายละเอียดลีด", robots: { index: false, follow: false } };

const LOG_LABELS: Record<CrmLogEntry["type"], string> = { status: "สถานะ", assign: "ผู้รับผิดชอบ", next_action: "นัดติดตาม", note: "บันทึก" };
const show = (value: unknown) => value == null || value === "" ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default async function AdminLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/leads/${encodeURIComponent(id)}`);
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  if (!uuidSchema.safeParse(id).success) notFound();
  const [lead, assignees] = await Promise.all([getLead(id), getAssignees().catch(() => [])]);
  if (!lead) notFound();
  const { crm_log: rawLog, ...details } = lead.details;
  const history = (Array.isArray(rawLog) ? (rawLog as CrmLogEntry[]) : []).slice().reverse();
  const describe = (entry: CrmLogEntry) => entry.type === "note" ? entry.text
    : entry.type === "status" ? `${LEAD_STATUS_LABELS[entry.from as keyof typeof LEAD_STATUS_LABELS] ?? show(entry.from)} → ${LEAD_STATUS_LABELS[entry.to as keyof typeof LEAD_STATUS_LABELS] ?? show(entry.to)}${entry.deal_id ? " (จากดีล)" : ""}`
    : entry.type === "next_action" ? `${formatBangkok(entry.from ?? null)} → ${formatBangkok(entry.to ?? null)}`
    : `${show(entry.from)} → ${show(entry.to)}`;
  return <main className="container-xl section space-y-6">
    <Link href="/admin/leads" className="text-sm text-brand-600">← ลีดทั้งหมด</Link>
    <header>
      <h1 className="break-words text-3xl font-bold">{lead.name}</h1>
      <p className="mt-2 text-sm text-slate-600">{LEAD_TYPE_LABELS[lead.lead_type] ?? lead.lead_type} · {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
        {isLeadOverdue(lead) && <span className="ml-2 font-semibold text-red-700">เลยนัดติดตาม</span>}</p>
      <p className="mt-1 break-words text-xs text-slate-500">ข้อมูลส่วนตัวสำหรับผู้ดูแลเท่านั้น · {lead.id}</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section className="min-w-0 space-y-6">
        <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 sm:p-5">
          {Object.entries({
            "โทรศัพท์": lead.phone, "LINE": lead.line_id, "แหล่งที่มา": lead.source, "รหัสผู้แนะนำ": lead.referral_code,
            "ผู้รับผิดชอบ": lead.assigned_to, "นัดติดตาม (เวลาไทย)": formatBangkok(lead.next_action_at),
            "PDPA": lead.consent_pdpa ? `ยินยอม ${formatBangkok(lead.consent_at)}` : "ไม่ยินยอม",
            "สร้างเมื่อ": formatBangkok(lead.created_at), "แก้ไขล่าสุด": formatBangkok(lead.updated_at),
          }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="break-words [overflow-wrap:anywhere]">{label === "โทรศัพท์" ? <a href={`tel:${value}`} className="text-brand-600">{value}</a> : show(value)}</dd></div>)}
        </dl>
        {Object.keys(details).length > 0 && <details className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <summary className="cursor-pointer font-semibold">ข้อมูลที่ลีดส่งมา (ส่วนตัว)</summary>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(details).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-slate-500">{key}</dt><dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{show(value)}</dd></div>)}
          </dl>
        </details>}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold">ผู้แนะนำ</h2>
          {!lead.referrals.length ? <p className="mt-2 text-sm text-slate-500">ไม่มีการแนะนำ{lead.referral_code ? ` (กรอกรหัส ${lead.referral_code} แต่ไม่พบพาร์ทเนอร์ที่ใช้งาน)` : ""}</p>
            : <ul className="mt-2 space-y-2 text-sm">{lead.referrals.map((ref) => <li key={ref.id} className="break-words">
              {ref.partner_name ?? "ไม่ทราบชื่อพาร์ทเนอร์"} · {ref.referral_code} · {ref.converted ? "ปิดดีลสำเร็จแล้ว" : "ยังไม่คอนเวอร์ชัน"}
              {ref.deal_id && <> · <Link href={`/admin/deals/${ref.deal_id}`} className="text-brand-600">ดีล</Link></>}
            </li>)}</ul>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold">ดีลของลีดนี้</h2>
          {!lead.deals.length ? <p className="mt-2 text-sm text-slate-500">ยังไม่มีดีล</p>
            : <ul className="mt-2 space-y-2 text-sm">{lead.deals.map((deal) => <li key={deal.id}><Link href={`/admin/deals/${deal.id}`} className="text-brand-600">{deal.title ?? deal.id.slice(0, 8)}</Link> · {DEAL_STAGE_LABELS[deal.stage] ?? deal.stage}</li>)}</ul>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold">ประวัติการติดตาม</h2>
          {!history.length ? <p className="mt-2 text-sm text-slate-500">ยังไม่มีประวัติ</p>
            : <ol className="mt-2 space-y-3 text-sm">{history.map((entry, index) => <li key={`${entry.at}-${index}`} className="border-l-2 border-slate-200 pl-3">
              <p className="text-xs text-slate-500">{formatBangkok(entry.at)} · {show(entry.by)} · {LOG_LABELS[entry.type] ?? entry.type}</p>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{describe(entry)}</p>
            </li>)}</ol>}
        </section>
      </section>
      <aside className="min-w-0 space-y-6">
        <LeadCrmForm key={lead.updated_at} assignees={assignees}
          lead={{ id: lead.id, status: lead.status, assigned_to: lead.assigned_to, next_action_at: lead.next_action_at, updated_at: lead.updated_at }} />
        {lead.lead_type === "buyer" && <DealCreateForm buyerLeadId={lead.id} assignees={assignees} />}
      </aside>
    </div>
  </main>;
}
