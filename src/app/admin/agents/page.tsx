import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isVerified } from "@/lib/verification";
import type { Agent } from "@/lib/types/database";
import { createAgent, updateAgentVerification } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent Verification", robots: { index: false, follow: false } };

export default async function AdminAgentsPage() {
  await requireAdmin("/admin/agents");
  const { data, error } = await createServerClient().from("agents").select("*").order("display_name");
  if (error) throw new Error(`Load agents failed: ${error.message}`);
  const agents = (data ?? []) as Agent[];
  return <section className="section min-h-[80vh] bg-slate-50"><div className="container-xl max-w-4xl">
    <Link href="/admin/properties" className="text-brand-600 hover:underline">← Property Backoffice</Link>
    <h1 className="mt-4 text-3xl font-bold">Verified Agents</h1>
    <p className="mt-2 text-sm text-slate-600">ชื่อผู้ดูแลประกาศเป็นข้อมูลสาธารณะ ทีมงานต้องตรวจตัวตนก่อนให้ป้าย Verified Agent แยกจากการตรวจแปลงและการสมัครพาร์ทเนอร์</p>
    <form action={createAgent} className="card my-6 flex flex-wrap items-end gap-3 p-5">
      <div className="flex-1"><label htmlFor="display_name" className="label">ชื่อผู้ดูแลประกาศ (สาธารณะ)</label><input id="display_name" name="display_name" required maxLength={150} className="input" /></div>
      <button type="submit" className="btn-primary">เพิ่มชื่อ · ยังไม่ Verified</button>
    </form>
    {agents.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีผู้ดูแลประกาศ</p>}
    <div className="space-y-4">{agents.map((agent) => <div key={agent.id} className="card p-5">
      <h2 className="font-bold">{agent.display_name} · {isVerified(agent) ? "Verified Agent" : "ยังไม่ตรวจ"}</h2>
      {isVerified(agent) && <p className="mt-1 text-xs text-slate-500">ตรวจเมื่อ {agent.verified_at} · ผู้ตรวจ {agent.verified_by}</p>}
      <form action={updateAgentVerification} className="mt-3 flex flex-wrap gap-3">
        <input type="hidden" name="agent_id" value={agent.id} />
        <button type="submit" name="decision" value="verify" className="btn-primary">ตรวจตัวตนแล้ว · ให้ป้าย</button>
        <button type="submit" name="decision" value="revoke" className="btn-outline">ถอนป้าย</button>
      </form>
    </div>)}</div>
  </div></section>;
}
