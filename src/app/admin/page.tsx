import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Backoffice", robots: { index: false, follow: false } };

export default async function AdminHomePage() {
  await requireAdmin("/admin");
  const db = createServerClient();
  const [newLeadsResult, qualifiedLeadsResult, activeDealsResult, wonDealsResult, payableCommissionsResult] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("status", "qualified"),
    db.from("deals").select("id", { count: "exact", head: true }).not("stage", "in", "(won,lost)"),
    db.from("deals").select("id", { count: "exact", head: true }).eq("stage", "won"),
    db.from("commissions").select("id", { count: "exact", head: true }).eq("status", "payable"),
  ]);

  const results = [newLeadsResult, qualifiedLeadsResult, activeDealsResult, wonDealsResult, payableCommissionsResult];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Load backoffice stats failed: ${failed.error.message}`);

  const newLeads = newLeadsResult.count ?? 0;
  const qualifiedLeads = qualifiedLeadsResult.count ?? 0;
  const activeDeals = activeDealsResult.count ?? 0;
  const wonDeals = wonDealsResult.count ?? 0;
  const payableCommissions = payableCommissionsResult.count ?? 0;

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl max-w-6xl">
        <div className="mb-7">
          <p className="text-sm font-medium text-brand-600">LandmarketThai Operations</p>
          <h1 className="text-3xl font-bold text-slate-900">Backoffice</h1>
          <p className="mt-1 text-sm text-slate-500">ระบบกึ่ง Automation: ระบบรวบรวมและเตือน คนเป็นผู้ตัดสินใจเรื่องแปลง ดีล และการจ่ายเงิน</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Lead ใหม่" value={newLeads} />
          <Stat label="Qualified" value={qualifiedLeads} />
          <Stat label="Deal กำลังเดิน" value={activeDeals} />
          <Stat label="ปิดดีลสำเร็จ" value={wonDeals} />
          <Stat label="Commission รอจ่าย" value={payableCommissions} />
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <Link href="/admin/leads" className="card p-6 transition-shadow hover:shadow-md">
            <div className="text-sm font-medium text-brand-600">01 · CRM</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Lead & Follow-up</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">คัดกรอง Lead, Assign ผู้ดูแล, เก็บ Requirement, Activity Timeline, นัดติดตาม และจับคู่ที่ดิน</p>
            <div className="mt-4 text-sm font-semibold text-brand-600">เปิด Lead CRM →</div>
          </Link>
          <Link href="/admin/deals" className="card p-6 transition-shadow hover:shadow-md">
            <div className="text-sm font-medium text-brand-600">02 · SALES</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Deal & Commission</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">เดิน Pipeline ตั้งแต่ส่งแปลง นัดดู เจรจา มัดจำ ปิดดีล และควบคุมค่าตอบแทนแบบ Human Approval</p>
            <div className="mt-4 text-sm font-semibold text-brand-600">เปิด Deal Pipeline →</div>
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
          <strong>Human-in-the-loop:</strong> Matching เป็นคำแนะนำ, Reminder ส่งเฉพาะทีมงาน, Commission ไม่อนุมัติ/ไม่จ่ายเอง และไม่มีข้อความหาลูกค้าอัตโนมัติจาก Backoffice
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></div>;
}
