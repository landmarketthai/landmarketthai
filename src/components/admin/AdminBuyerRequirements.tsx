"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BuyerRequirement, Province } from "@/lib/types/database";
import { BUYER_ACTIONS, BUYER_STATUS_LABELS, canApplyBuyerAction, type BuyerAdminAction } from "@/lib/marketplace/buyer-demand-workflow";
import { buyerApprovalReadinessIssues, buyerPublishReadinessIssues } from "@/app/admin/buyer-requirements/review-readiness";
import { PROPERTY_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/marketplace/presentation";

export default function AdminBuyerRequirements({ requirements, provinces }: { requirements: BuyerRequirement[]; provinces: Province[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [staleVersions, setStaleVersions] = useState<Record<string, string>>({});
  const saving = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const provinceNames = new Map(provinces.map((province) => [province.id, province.name_th]));
  async function act(item: BuyerRequirement, action: BuyerAdminAction) {
    if (saving.current || refreshing || staleVersions[item.id] === item.updated_at || !canApplyBuyerAction(item.status, action)) return;
    if ((action === "publish" && buyerPublishReadinessIssues(item).length) || (action === "reject" && !notes[item.id]?.trim())) return;
    if (action === "approve" && buyerApprovalReadinessIssues(item).length) return;
    const { id } = item;
    saving.current = true;
    setBusy(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/buyer-requirements/${id}`, {
        method: "PATCH", cache: "no-store", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, expected_updated_at: item.updated_at, note: notes[id] || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok || response.status === 409) {
        setStaleVersions((current) => ({ ...current, [id]: item.updated_at }));
        startTransition(() => router.refresh());
      }
      if (!response.ok) throw new Error(body.error ?? "ดำเนินการไม่สำเร็จ");
      setNotes((current) => ({ ...current, [id]: "" }));
      setMessage(`${BUYER_ACTIONS[action].label} สำเร็จ · ${id.slice(0, 8)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ดำเนินการไม่สำเร็จ"); }
    finally { saving.current = false; setBusy(""); }
  }
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm text-slate-600">{busy || refreshing ? "กำลังบันทึก / โหลดสถานะล่าสุด..." : message}</p>
    <button type="button" className="btn-outline text-sm" disabled={Boolean(busy) || refreshing} onClick={() => startTransition(() => router.refresh())}>โหลดรายการใหม่</button>
    {!requirements.length && <p className="p-6 text-slate-500">ยังไม่มีความต้องการซื้อ</p>}
    {requirements.map((item) => {
      const issues = buyerPublishReadinessIssues(item);
      const approvalIssues = buyerApprovalReadinessIssues(item);
      const stale = staleVersions[item.id] === item.updated_at;
      const actions = (Object.keys(BUYER_ACTIONS) as BuyerAdminAction[]).filter((action) => canApplyBuyerAction(item.status, action));
      return <details key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-busy={busy === item.id || refreshing}>
      <summary className="cursor-pointer break-words font-semibold leading-7">{item.name} · {BUYER_STATUS_LABELS[item.status]} · {item.id.slice(0, 8)}</summary>
      <p className="mt-3 break-words [overflow-wrap:anywhere] text-xs text-slate-500">ข้อมูลส่วนตัวสำหรับผู้ดูแลเท่านั้น · {item.id}</p>
      <dl className="my-5 grid gap-3 text-sm sm:grid-cols-2">
        {Object.entries({
          "โทรศัพท์": item.phone, "LINE": item.line_id, "ประเภททรัพย์": item.property_type ? (PROPERTY_TYPE_LABELS[item.property_type] ?? PROPERTY_TYPE_LABELS.other) : "ทุกประเภท", "ประเภทการซื้อขาย": TRANSACTION_TYPE_LABELS[item.transaction_type],
          "จังหวัด": item.province_ids.length ? item.province_ids.map((id) => provinceNames.get(id) ?? id).join(", ") : "ทุกจังหวัด", "ทำเลเพิ่มเติม (ส่วนตัว)": item.preferred_locations.join(", "),
          "ขั้นต่ำ (ไร่)": item.min_size_rai, "สูงสุด (ไร่)": item.max_size_rai,
          "พื้นที่ใช้สอยขั้นต่ำ (ตร.ม.)": item.min_usable_area_sqm, "พื้นที่ใช้สอยสูงสุด (ตร.ม.)": item.max_usable_area_sqm,
          "งบสูงสุด (บาท)": item.max_price, "ราคาสูงสุด/ไร่": item.max_price_per_rai, "ผังเมือง": item.zoning,
          "รถคอนเทนเนอร์": item.container_access == null ? null : item.container_access ? "ต้องการ" : "ไม่จำเป็น",
          "ไฟฟ้าแรงสูง": item.high_voltage == null ? null : item.high_voltage ? "ต้องการ" : "ไม่จำเป็น",
          "วัตถุประสงค์ (ส่วนตัว)": item.purpose, "ใช้น้ำ (ส่วนตัว)": item.water_requirement,
          "ข้อกำหนดพิเศษ (ส่วนตัว)": item.special_requirements, "ส่งเมื่อ": item.submitted_at,
          "PDPA": item.consent_pdpa ? item.consent_pdpa_at : "ไม่ยินยอม",
          "สาธารณะ": item.consent_public ? item.consent_public_at : "ไม่ยินยอม",
          "ตรวจสอบเมื่อ": item.reviewed_at, "ตรวจสอบโดย": item.reviewed_by,
          "หมายเหตุตรวจสอบ": item.review_note, "เผยแพร่ครั้งแรก": item.published_at, "ปิดเมื่อ": item.closed_at, "แก้ไขล่าสุด": item.updated_at,
        }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{typeof value === "number" ? value.toLocaleString("th-TH", { maximumFractionDigits: 5 }) : value || "ไม่ระบุ"}</dd></div>)}
      </dl>
      <p className="mb-4 text-sm text-slate-600">สาธารณะจะแสดงเฉพาะประเภททรัพย์ จังหวัด ขนาด งบ ผังเมือง รถคอนเทนเนอร์ และไฟฟ้า ไม่เผยแพร่ชื่อ ติดต่อ ทำเลที่พิมพ์ หรือข้อความอื่น</p>
      {item.status === "published" && item.public_slug && <Link className="text-sm text-brand-600" href={`/buyer-demand/${item.public_slug}`}>ดูประกาศสาธารณะ →</Link>}
      {(item.status === "pending_review" || item.status === "approved" || item.status === "published" || item.status === "rejected") && <p className={`mt-4 rounded-xl p-3 text-sm ${issues.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{issues.length ? `ยังเผยแพร่ไม่ได้: ${issues.join(" · ")}` : "มีความยินยอมสาธารณะและหลักฐานการตรวจสอบครบ"}</p>}
      {actions.length > 0 && <label className="mt-4 block"><span className="label">หมายเหตุตรวจสอบ / เหตุผลที่ปฏิเสธ (ส่วนตัว)</span><textarea rows={3} maxLength={2000} disabled={Boolean(busy) || refreshing} className="input" value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /><span className="mt-1 block text-xs text-slate-500">ต้องระบุเหตุผลก่อนปฏิเสธ · ไม่เกิน 2,000 ตัวอักษร</span></label>}
      {approvalIssues.length > 0 && actions.includes("approve") && <p className="mt-3 text-sm text-amber-800">ยังอนุมัติไม่ได้: {approvalIssues.join(" · ")}</p>}
      {stale && <p role="status" className="mt-4 text-sm text-amber-800">รายการนี้เปลี่ยนแปลงแล้ว กรุณารอข้อมูลล่าสุดหรือกดโหลดรายการใหม่ก่อนดำเนินการต่อ</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => <button key={action} type="button" className="btn-outline min-h-11 w-full whitespace-normal text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={Boolean(busy) || refreshing || stale || (action === "approve" && approvalIssues.length > 0) || (action === "publish" && issues.length > 0) || (action === "reject" && !notes[item.id]?.trim())} onClick={() => act(item, action)}>{BUYER_ACTIONS[action].label}</button>)}
      </div>
      {!actions.length && <p className="text-sm text-slate-500">สถานะนี้ไม่มีคำสั่งเพิ่มเติม</p>}
    </details>; })}
    <p className="text-xs text-slate-500">แสดง {requirements.length} รายการล่าสุด (หน้าปัจจุบัน)</p>
  </div>;
}
