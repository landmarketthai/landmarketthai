import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import type { DealStage } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deal Pipeline", robots: { index: false, follow: false } };

const STAGE_LABELS: Record<DealStage, string> = {
  qualified: "Qualified",
  property_sent: "ส่งแปลงแล้ว",
  site_visit: "นัดดูที่ดิน",
  negotiation: "เจรจา",
  offer: "เสนอราคา",
  deposit: "มัดจำ",
  won: "ปิดดีลสำเร็จ",
  lost: "ปิดไม่สำเร็จ",
};

function money(value: number | null) {
  return value === null ? "—" : `${Number(value).toLocaleString("th-TH")} บาท`;
}

export default async function AdminDealsPage() {
  await requireAdmin("/admin/deals");
  const { data, error } = await createServerClient()
    .from("deals")
    .select("id,listing_ref,listing_title,buyer_lead_id,referral_code,deal_value,expected_commission,status,stage,assigned_to,created_at,updated_at,buyer:leads(name,phone),commission:commissions(id,source_type,referral_code,status,amount_estimated,amount_approved,amount_paid)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Load deals failed: ${error.message}`);

  const deals = data ?? [];
  const active = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost").length;
  const won = deals.filter((deal) => deal.stage === "won").length;
  const payable = deals.filter((deal) => {
    const commissions = Array.isArray(deal.commission) ? deal.commission : deal.commission ? [deal.commission] : [];
    return commissions.some((commission) => commission.status === "payable");
  }).length;

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">Sales Pipeline</p>
            <h1 className="text-3xl font-bold text-slate-900">Deal Pipeline</h1>
            <p className="mt-1 text-sm text-slate-500">จาก Lead ที่ผ่านการคัดกรอง → ส่งแปลง → นัดดู → เจรจา → ปิดดีล → ค่าตอบแทน</p>
          </div>
          <Link href="/admin/leads" className="btn-outline">← Lead CRM</Link>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="card p-4"><div className="text-xs text-slate-500">กำลังดำเนินการ</div><div className="mt-1 text-2xl font-bold text-slate-900">{active}</div></div>
          <div className="card p-4"><div className="text-xs text-slate-500">ปิดดีลสำเร็จ</div><div className="mt-1 text-2xl font-bold text-green-700">{won}</div></div>
          <div className="card p-4"><div className="text-xs text-slate-500">ค่าตอบแทนรอจ่าย</div><div className="mt-1 text-2xl font-bold text-amber-700">{payable}</div></div>
        </div>

        {deals.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">ยังไม่มี Deal · เปิด Deal จากหน้า Buyer Lead หลังเลือกแปลงที่เหมาะสม</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[1050px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">แปลง</th><th className="px-4 py-3">Buyer</th><th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">มูลค่าดีล</th><th className="px-4 py-3">Referral</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">ผู้ดูแล</th><th className="px-4 py-3">เปิด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deals.map((deal) => {
                  const buyer = Array.isArray(deal.buyer) ? deal.buyer[0] : deal.buyer;
                  const commissions = Array.isArray(deal.commission) ? deal.commission : deal.commission ? [deal.commission] : [];
                  const referralCodes = [...new Set(commissions.map((commission) => commission.referral_code).filter(Boolean))];
                  return (
                    <tr key={deal.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4"><div className="font-semibold text-slate-900">{deal.listing_title || deal.listing_ref || "ไม่ระบุ"}</div><div className="text-xs text-slate-500">{deal.listing_ref}</div></td>
                      <td className="px-4 py-4"><div className="font-medium text-slate-800">{buyer?.name ?? "—"}</div><div className="text-xs text-slate-500">{buyer?.phone}</div></td>
                      <td className="px-4 py-4 font-medium text-brand-700">{STAGE_LABELS[deal.stage as DealStage] ?? deal.stage}</td>
                      <td className="px-4 py-4">{money(deal.deal_value)}</td>
                      <td className="px-4 py-4">{referralCodes.length > 0 ? referralCodes.join(", ") : deal.referral_code || "—"}</td>
                      <td className="px-4 py-4">
                        {commissions.length === 0 ? "—" : (
                          <div className="space-y-1">
                            {commissions.map((commission) => (
                              <div key={commission.id} className="text-xs">
                                <span className="font-semibold text-slate-700">{commission.source_type === "owner" ? "Owner" : "Buyer"}</span>
                                {" · "}{commission.status}{" · "}{money(commission.amount_approved ?? commission.amount_estimated ?? null)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">{deal.assigned_to || "—"}</td>
                      <td className="px-4 py-4"><Link href={`/admin/deals/${deal.id}`} className="font-semibold text-brand-600 hover:underline">รายละเอียด →</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
