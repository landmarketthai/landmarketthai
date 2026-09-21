import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus, LeadType } from "@/lib/types/database";
import { updateLeadAssignee, updateLeadStatus } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "จัดการ Lead",
  robots: { index: false, follow: false },
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "ใหม่" },
  { value: "contacting", label: "กำลังติดต่อ" },
  { value: "qualified", label: "ผ่านการคัดกรอง" },
  { value: "won", label: "ปิดดีล" },
  { value: "lost", label: "ไม่สำเร็จ" },
];

const TYPE_LABELS: Record<LeadType, string> = {
  buyer: "ผู้ซื้อ",
  owner: "เจ้าของที่ดิน",
  partner: "พาร์ทเนอร์",
};

const DETAIL_LABELS: Record<string, string> = {
  province: "จังหวัด",
  district: "อำเภอ",
  land_type: "ประเภทที่ดิน",
  size_rai: "ขนาด (ไร่)",
  budget_min: "งบเริ่มต้น",
  budget_max: "งบสูงสุด",
  asking_price: "ราคาที่ต้องการ",
  deed_type: "เอกสารสิทธิ์",
  working_area: "พื้นที่ทำงาน",
  experience: "ประสบการณ์",
  network_size: "เครือข่าย",
  notes: "หมายเหตุ",
  listing_id: "ประกาศ",
  raw_referral_code: "รหัสแนะนำ",
};

function formatDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

function formatThaiDate(value: string) {
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface SearchParams {
  q?: string;
  status?: string;
  type?: string;
}

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;

  const { data, error } = await createServerClient()
    .from("leads")
    .select("id,lead_type,name,phone,line_id,source,referral_code,status,assigned_to,next_action_at,details,consent_pdpa,consent_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Load leads failed: ${error.message}`);
  const allLeads = (data ?? []) as Lead[];

  const q = params.q?.trim().toLowerCase() ?? "";
  const status = STATUS_OPTIONS.some((option) => option.value === params.status) ? params.status : "";
  const type = ["buyer", "owner", "partner"].includes(params.type ?? "") ? params.type : "";
  const leads = allLeads.filter((lead) => {
    if (status && lead.status !== status) return false;
    if (type && lead.lead_type !== type) return false;
    if (!q) return true;
    return [lead.name, lead.phone, lead.line_id, lead.source, lead.referral_code, lead.assigned_to]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const statusCounts = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: allLeads.filter((lead) => lead.status === option.value).length,
  }));

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">ศูนย์จัดการลีด</p>
            <h1 className="text-3xl font-bold text-slate-900">จัดการ Lead</h1>
            <p className="mt-1 text-sm text-slate-500">100 รายการล่าสุด · คัดกรอง มอบหมาย นัดติดตาม และบันทึกกิจกรรม</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
            แสดง <strong className="text-slate-900">{leads.length}</strong> / {allLeads.length}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statusCounts.map((item) => (
            <Link
              key={item.value}
              href={`/admin/leads?status=${item.value}`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200 hover:bg-brand-50"
            >
              <div className="text-xs font-medium text-slate-500">{item.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{item.count}</div>
            </Link>
          ))}
        </div>

        <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px_auto]">
          <input name="q" defaultValue={params.q ?? ""} className="input" placeholder="ค้นชื่อ เบอร์ LINE source หรือผู้ดูแล" />
          <select name="status" defaultValue={status} className="input">
            <option value="">ทุกสถานะ</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select name="type" defaultValue={type} className="input">
            <option value="">ทุกประเภท</option>
            <option value="buyer">ผู้ซื้อ</option>
            <option value="owner">เจ้าของที่ดิน</option>
            <option value="partner">พาร์ทเนอร์</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-4">กรอง</button>
            <Link href="/admin/leads" className="btn-outline px-4">ล้าง</Link>
          </div>
        </form>

        {leads.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">ไม่พบ Lead ตามเงื่อนไข</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[1320px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">ผู้ติดต่อ</th>
                  <th className="px-4 py-3">ที่มา</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3">นัดถัดไป</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ผู้รับผิดชอบ</th>
                  <th className="px-4 py-3">เปิด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                    <tr key={lead.id} className="align-top hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatThaiDate(lead.created_at)}</td>
                      <td className="px-4 py-4 font-medium text-slate-800">{TYPE_LABELS[lead.lead_type]}</td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{lead.name}</div>
                        <a className="text-brand-600 hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>
                        {lead.line_id && <div className="text-xs text-slate-500">LINE: {lead.line_id}</div>}
                        {lead.referral_code && <div className="text-xs text-slate-500">Ref: {lead.referral_code}</div>}
                      </td>
                      <td className="max-w-48 break-words px-4 py-4 text-slate-600">{lead.source || "—"}</td>
                      <td className="max-w-80 px-4 py-4 text-xs leading-relaxed text-slate-600">{formatDetails(lead.details)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {lead.next_action_at ? formatThaiDate(lead.next_action_at) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <form action={updateLeadStatus} className="flex gap-2">
                          <input type="hidden" name="lead_id" value={lead.id} />
                          <select name="status" defaultValue={lead.status} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">
                            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <button className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600" type="submit">บันทึก</button>
                        </form>
                      </td>
                      <td className="px-4 py-4">
                        <form action={updateLeadAssignee} className="flex gap-2">
                          <input type="hidden" name="lead_id" value={lead.id} />
                          <input name="assigned_to" defaultValue={lead.assigned_to ?? ""} maxLength={100} className="w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="ชื่อผู้ดูแล" />
                          <button className="rounded-lg border border-brand-500 px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50" type="submit">บันทึก</button>
                        </form>
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/leads/${lead.id}`} className="font-semibold text-brand-600 hover:underline">รายละเอียด →</Link>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
