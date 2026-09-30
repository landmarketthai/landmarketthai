import Link from "next/link";
import type { PropertyBuyerMatch } from "@/lib/buyer-matching";

/** Render only inside authenticated admin routes; never supply private leads to public pages. */
export function PropertyBuyerRecommendations({ matches }: { matches: readonly PropertyBuyerMatch[] }) {
  return <section className="card space-y-3 p-5">
    <h2 className="text-lg font-bold">ผู้ซื้อที่ระบบแนะนำสำหรับแปลงนี้</h2>
    <p className="text-xs text-slate-500">คำแนะนำจากผู้ซื้อที่ยังเปิดอยู่ล่าสุดไม่เกิน 1,000 ราย · ทีมงานต้องตรวจสอบและอนุมัติก่อนส่งข้อมูลหรือเปิดดีล</p>
    {matches.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีผู้ซื้อที่มีเงื่อนไขเหมาะสม</p> : <ul className="space-y-3">{matches.map(({ buyer, score, reasons, missingData }) => <li key={buyer.id} className="rounded-xl border border-slate-200 p-3">
      <Link href={`/admin/leads/${encodeURIComponent(buyer.id)}`} className="text-sm font-semibold text-brand-600 hover:underline">ตรวจสอบผู้ซื้อ →</Link><span className="ml-3 text-xs">คะแนน {score}</span>
      <p className="mt-2 text-xs text-slate-600">{reasons.join(" · ")}</p>
      {missingData.length > 0 && <p className="mt-1 text-xs text-amber-800">{missingData.join(" · ")}</p>}
    </li>)}</ul>}
  </section>;
}
