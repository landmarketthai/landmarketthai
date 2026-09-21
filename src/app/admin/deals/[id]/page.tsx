import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import type { Commission, Deal, DealStage } from "@/lib/types/database";
import { updateCommission, updateDealStage } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รายละเอียด Deal", robots: { index: false, follow: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES: { value: DealStage; label: string }[] = [
  { value: "qualified", label: "Qualified" },
  { value: "property_sent", label: "ส่งข้อมูลแปลงแล้ว" },
  { value: "site_visit", label: "นัดดูที่ดิน" },
  { value: "negotiation", label: "เจรจา" },
  { value: "offer", label: "เสนอราคา" },
  { value: "deposit", label: "มัดจำ" },
  { value: "won", label: "ปิดดีลสำเร็จ" },
  { value: "lost", label: "ปิดไม่สำเร็จ" },
];

function money(value: number | null) {
  return value === null ? "—" : `${Number(value).toLocaleString("th-TH")} บาท`;
}

export default async function AdminDealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/deals");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const db = createServerClient();
  const { data, error } = await db
    .from("deals")
    .select("*,buyer:leads(id,name,phone,line_id,status,assigned_to),commission:commissions(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Load deal failed: ${error.message}`);
  if (!data) notFound();

  const deal = data as unknown as Deal & { buyer?: { id: string; name: string; phone: string; line_id: string | null; status: string; assigned_to: string | null }; commission?: Commission[] | Commission | null };
  const commissions = Array.isArray(deal.commission) ? deal.commission : deal.commission ? [deal.commission] : [];

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl max-w-5xl">
        <div className="mb-5 flex flex-wrap gap-4 text-sm">
          <Link href="/admin/deals" className="font-medium text-brand-600 hover:underline">← Deal Pipeline</Link>
          {deal.buyer_lead_id && <Link href={`/admin/leads/${deal.buyer_lead_id}`} className="font-medium text-brand-600 hover:underline">เปิด Buyer Lead →</Link>}
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-brand-600">Deal</p>
          <h1 className="text-3xl font-bold text-slate-900">{deal.listing_title || deal.listing_ref || "Deal"}</h1>
          <p className="mt-1 text-sm text-slate-500">Buyer: {deal.buyer?.name ?? "—"} · Referral: {deal.referral_code || "ไม่มี"}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Pipeline</h2>
            <form action={updateDealStage} className="space-y-4">
              <input type="hidden" name="deal_id" value={deal.id} />
              <div><label className="label" htmlFor="stage">Stage</label><select id="stage" name="stage" defaultValue={deal.stage} className="input">{STAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <div><label className="label" htmlFor="deal_value">มูลค่าดีลจริง (บาท)</label><input id="deal_value" name="deal_value" type="number" min="0" step="1000" defaultValue={deal.deal_value ?? ""} className="input" placeholder="ใส่เมื่อเริ่มรู้ราคาที่เจรจา" /></div>
              <div><label className="label" htmlFor="assigned_to">ผู้รับผิดชอบ</label><input id="assigned_to" name="assigned_to" maxLength={100} defaultValue={deal.assigned_to ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="notes">บันทึกดีล</label><textarea id="notes" name="notes" maxLength={4000} rows={5} defaultValue={deal.notes ?? ""} className="input resize-y" /></div>
              <button type="submit" className="btn-primary">บันทึก Deal</button>
            </form>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div><div className="text-xs text-slate-500">มูลค่าดีล</div><div className="font-semibold">{money(deal.deal_value)}</div></div>
              <div><div className="text-xs text-slate-500">ค่าตอบแทนประมาณการ</div><div className="font-semibold">{money(deal.expected_commission)}</div></div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-bold text-slate-900">Commission Control</h2>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">ระบบไม่อนุมัติหรือจ่ายค่าตอบแทนอัตโนมัติ ต้องมีคนตรวจยอดและเปลี่ยนสถานะเองทุกครั้ง</p>
            {commissions.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500">Deal นี้ไม่มี Referral/Commission record</p>
            ) : (
              <div className="mt-5 space-y-5">
                {commissions.map((commission, index) => {
                  const prefix = `commission-${commission.id}`;
                  return (
                    <form key={commission.id} action={updateCommission} className="space-y-4 rounded-xl border border-slate-200 p-4">
                      <input type="hidden" name="commission_id" value={commission.id} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-slate-500">Referral ฝั่ง</div>
                          <div className="font-semibold text-slate-900">{commission.source_type === "owner" ? "เจ้าของที่ดิน" : "ผู้ซื้อ"}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">Ref: {commission.referral_code || "—"}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="text-xs text-slate-500">ประมาณการจากตอนเปิด Deal</div><div className="mt-1 font-semibold">{money(commission.amount_estimated)}</div></div>
                      <div><label className="label" htmlFor={`${prefix}-status`}>สถานะ</label><select id={`${prefix}-status`} name="status" defaultValue={commission.status} className="input"><option value="estimated">ประมาณการ</option><option value="approved">อนุมัติยอดแล้ว</option><option value="payable">พร้อมจ่าย</option><option value="paid">จ่ายแล้ว</option><option value="cancelled">ยกเลิก</option></select></div>
                      <div><label className="label" htmlFor={`${prefix}-approved`}>ยอดที่อนุมัติ (บาท)</label><input id={`${prefix}-approved`} name="amount_approved" type="number" min="0" step="1000" defaultValue={commission.amount_approved ?? ""} className="input" /></div>
                      <div><label className="label" htmlFor={`${prefix}-paid`}>ยอดจ่ายจริง (บาท)</label><input id={`${prefix}-paid`} name="amount_paid" type="number" min="0" step="1000" defaultValue={commission.amount_paid ?? 0} className="input" /></div>
                      <button type="submit" className="btn-primary">บันทึก Commission {index + 1}</button>
                    </form>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
