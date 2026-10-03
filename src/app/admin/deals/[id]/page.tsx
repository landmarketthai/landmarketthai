import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, isAdminUserAllowed } from "@/lib/auth/admin";
import { uuidSchema } from "@/lib/operations/schemas";
import { getAssignees, getDeal } from "@/lib/operations/queries";
import { DEAL_STAGE_LABELS, DEAL_STATUS_LABELS, formatBangkok, LEAD_STATUS_LABELS } from "@/lib/operations/rules";
import { DealUpdateForm } from "@/components/admin/OperationsForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายละเอียดดีล", robots: { index: false, follow: false } };

const baht = (value: number | null) => (value == null ? "-" : `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`);

export default async function AdminDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/deals/${encodeURIComponent(id)}`);
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>ไม่มีสิทธิ์เข้าถึง</h1><Link href="/">กลับหน้าหลัก</Link></main>;
  if (!uuidSchema.safeParse(id).success) notFound();
  const [deal, assignees] = await Promise.all([getDeal(id), getAssignees().catch(() => [])]);
  if (!deal) notFound();
  const rows: [string, ReactNode][] = [
    ["ขั้นตอน", DEAL_STAGE_LABELS[deal.stage] ?? deal.stage],
    ["สถานะ", DEAL_STATUS_LABELS[deal.status] ?? deal.status],
    ["ผู้ซื้อ", deal.buyer_lead_id ? <Link href={`/admin/leads/${deal.buyer_lead_id}`} className="text-brand-600">{deal.buyer_name ?? deal.buyer_lead_id}</Link> : "-"],
    ["สถานะลีดผู้ซื้อ", deal.buyer_status ? LEAD_STATUS_LABELS[deal.buyer_status] ?? deal.buyer_status : "-"],
    ["โทรศัพท์ผู้ซื้อ", deal.buyer_phone ? <a href={`tel:${deal.buyer_phone}`} className="text-brand-600">{deal.buyer_phone}</a> : "-"],
    ["LINE ผู้ซื้อ", deal.buyer_line_id ?? "-"],
    ["ทรัพย์", deal.land_slug ? <Link href={`/properties/${deal.land_slug}`} className="text-brand-600">{deal.land_title ?? deal.land_slug}</Link> : deal.title ?? "-"],
    ["รหัสประกาศ", deal.listing_ref ?? "-"],
    ["land_id", deal.land_id ?? "-"],
    ["พาร์ทเนอร์ผู้แนะนำ", deal.partner_name ?? "-"],
    ["รหัสผู้แนะนำ", deal.referral_code ?? "-"],
    ["การแนะนำที่ผูกกับดีล", deal.referrals.length ? deal.referrals.map((ref) => `${ref.referral_code} (${ref.converted ? "คอนเวอร์ชันแล้ว" : "ยังไม่คอนเวอร์ชัน"})`).join(", ") : "-"],
    ["มูลค่าดีล", baht(deal.deal_value)],
    ["ค่าคอมฯ ที่คาด", baht(deal.expected_commission)],
    ["ค่าคอมฯ ที่จ่ายแล้ว", baht(deal.commission_paid)],
    ["ผู้รับผิดชอบ", deal.assigned_to ?? "-"],
    ["สร้างเมื่อ", formatBangkok(deal.created_at)],
    ["แก้ไขล่าสุด", formatBangkok(deal.updated_at)],
    ["ปิดเมื่อ", formatBangkok(deal.closed_at)],
  ];
  return <main className="container-xl section space-y-6">
    <Link href="/admin/deals" className="text-sm text-brand-600">← ไปป์ไลน์ดีล</Link>
    <header>
      <h1 className="break-words text-3xl font-bold">{deal.title ?? deal.listing_ref ?? "ดีล"}</h1>
      <p className="mt-1 break-words text-xs text-slate-500">ข้อมูลภายในสำหรับผู้ดูแลเท่านั้น · {deal.id}</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section className="min-w-0 space-y-6">
        <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 sm:p-5">
          {rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="break-words [overflow-wrap:anywhere]">{value}</dd></div>)}
        </dl>
        {deal.notes && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="font-semibold">หมายเหตุ</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{deal.notes}</p></section>}
      </section>
      <aside className="min-w-0">
        <DealUpdateForm key={deal.updated_at} assignees={assignees}
          deal={{ id: deal.id, stage: deal.stage, deal_value: deal.deal_value, expected_commission: deal.expected_commission, assigned_to: deal.assigned_to, notes: deal.notes, updated_at: deal.updated_at }} />
      </aside>
    </div>
  </main>;
}
