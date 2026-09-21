import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Property Operations", robots: { index: false, follow: false } };

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "เผยแพร่",
  reserved: "Reserved",
  sold: "Sold",
  archived: "Archived",
};

export default async function AdminPropertiesPage() {
  await requireAdmin("/admin/properties");
  const db = createServerClient();
  const [{ data: lands, error: landError }, { data: ownerLeads, error: leadError }] = await Promise.all([
    db.from("lands").select("id,title_th,slug,status,size_rai,price_per_rai,owner_lead_id,province:provinces(name_th)").is("deleted_at", null).order("updated_at", { ascending: false }).limit(200),
    db.from("leads").select("id,name,phone,status,details,created_at").eq("lead_type", "owner").order("created_at", { ascending: false }).limit(100),
  ]);
  if (landError) throw new Error(`Load properties failed: ${landError.message}`);
  if (leadError) throw new Error(`Load owner leads failed: ${leadError.message}`);

  const linkedLeadIds = new Set((lands ?? []).map((land) => land.owner_lead_id).filter(Boolean));
  const pendingOwnerLeads = (ownerLeads ?? []).filter((lead) => !linkedLeadIds.has(lead.id) && lead.status !== "lost");

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">Inventory Operations</p>
            <h1 className="text-3xl font-bold text-slate-900">Property Backoffice</h1>
            <p className="mt-1 text-sm text-slate-500">Owner Lead → ตรวจข้อมูล → Draft → เผยแพร่ → Matching → Deal</p>
          </div>
          <div className="flex gap-2"><Link href="/admin" className="btn-outline">Backoffice</Link><Link href="/admin/leads?type=owner" className="btn-outline">Owner Leads</Link></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">รอตรวจ Owner Lead</h2><span className="text-xs text-slate-500">{pendingOwnerLeads.length}</span></div>
            {pendingOwnerLeads.length === 0 ? <p className="text-sm text-slate-500">ไม่มี Owner Lead ที่รอสร้าง Property</p> : (
              <div className="space-y-2">
                {pendingOwnerLeads.map((lead) => (
                  <Link key={lead.id} href={`/admin/leads/${lead.id}`} className="block rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                    <div className="font-semibold text-slate-900">{lead.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{lead.phone} · {String((lead.details as Record<string, unknown>)?.province ?? "ไม่ระบุจังหวัด")}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-bold text-slate-900">Canonical Inventory</h2><p className="mt-1 text-xs text-slate-500">เฉพาะข้อมูลในฐานข้อมูล · Seed fallback ยังคงแสดง public ได้ตามระบบเดิม</p></div>
            {(lands ?? []).length === 0 ? <p className="p-5 text-sm text-slate-500">ยังไม่มี Property ในฐานข้อมูล</p> : (
              <div className="divide-y divide-slate-100">
                {(lands ?? []).map((land) => {
                  const province = Array.isArray(land.province) ? land.province[0] : land.province;
                  return (
                    <Link key={land.id} href={`/admin/properties/${land.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
                      <div>
                        <div className="font-semibold text-slate-900">{land.title_th}</div>
                        <div className="mt-1 text-xs text-slate-500">{province?.name_th ?? "—"} · {Number(land.size_rai).toLocaleString("th-TH")} ไร่ · {Number(land.price_per_rai).toLocaleString("th-TH")} บาท/ไร่</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{STATUS_LABELS[land.status] ?? land.status}</span>
                    </Link>
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
