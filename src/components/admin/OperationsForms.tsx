"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Deal, Lead, LeadStatus } from "@/lib/types/database";
import { DEAL_STAGES, DEAL_STAGE_LABELS, fromBangkokInput, LEAD_STATUS_LABELS, nextLeadStatuses, toBangkokInput } from "@/lib/operations/rules";

const money = (value: string) => (value.trim() === "" ? null : Number(value));

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function send(url: string, method: "PATCH" | "POST", body: object) {
    if (busy) return null;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (response.ok || response.status === 409) router.refresh();
      if (!response.ok) { setError(data.error ?? "บันทึกไม่สำเร็จ"); return { ok: false, data }; }
      setMessage("บันทึกแล้ว");
      return { ok: true, data };
    } catch {
      setError("บันทึกไม่สำเร็จ");
      return null;
    } finally { setBusy(false); }
  }
  return { busy, error, message, send, router };
}

function Feedback({ error, message }: { error: string; message: string }) {
  return <>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm text-emerald-700">{message}</p>
  </>;
}

function Assignees({ id, values }: { id: string; values: string[] }) {
  return <datalist id={id}>{values.map((value) => <option key={value} value={value} />)}</datalist>;
}

export function LeadCrmForm({ lead, assignees }: { lead: Pick<Lead, "id" | "status" | "assigned_to" | "next_action_at" | "updated_at">; assignees: string[] }) {
  const { busy, error, message, send } = useSubmit();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [owner, setOwner] = useState(lead.assigned_to ?? "");
  const [nextAction, setNextAction] = useState(toBangkokInput(lead.next_action_at));
  const [note, setNote] = useState("");
  const ended = lead.status === "won" || lead.status === "lost";
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = { expected_updated_at: lead.updated_at };
    if (status !== lead.status) { body.status = status; if (ended) body.reopen = true; }
    if (owner.trim() !== (lead.assigned_to ?? "")) body.assigned_to = owner.trim() || null;
    if (nextAction !== toBangkokInput(lead.next_action_at)) body.next_action_at = fromBangkokInput(nextAction);
    if (note.trim()) body.note = note.trim();
    if (Object.keys(body).length === 1) return;
    const result = await send(`/api/admin/leads/${lead.id}`, "PATCH", body);
    if (result?.ok) setNote("");
  }
  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">อัปเดตการติดตาม</h2>
    <label className="block"><span className="label">สถานะ</span>
      <select className="input" value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as LeadStatus)}>
        <option value={lead.status}>{LEAD_STATUS_LABELS[lead.status]} (ปัจจุบัน)</option>
        {nextLeadStatuses(lead.status).map((value) => <option key={value} value={value}>{ended ? `เปิดลีดใหม่ → ${LEAD_STATUS_LABELS[value]}` : LEAD_STATUS_LABELS[value]}</option>)}
      </select>
    </label>
    {ended && status !== lead.status && <p className="text-sm text-amber-800">ยืนยันการเปิดลีดที่ปิดแล้วกลับมาติดตามอีกครั้ง</p>}
    <label className="block"><span className="label">ผู้รับผิดชอบ</span>
      <input className="input" list="crm-assignees" maxLength={120} value={owner} disabled={busy} onChange={(event) => setOwner(event.target.value)} placeholder="อีเมลหรือชื่อทีมงาน" />
      <Assignees id="crm-assignees" values={assignees} />
    </label>
    <label className="block"><span className="label">นัดติดตามครั้งถัดไป (เวลาไทย)</span>
      <input type="datetime-local" className="input" value={nextAction} disabled={busy} onChange={(event) => setNextAction(event.target.value)} />
    </label>
    <label className="block"><span className="label">บันทึกภายใน (เฉพาะผู้ดูแล)</span>
      <textarea rows={3} maxLength={2000} className="input" value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
    </label>
    <Feedback error={error} message={message} />
    <button className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
  </form>;
}

export function DealCreateForm({ buyerLeadId, assignees }: { buyerLeadId: string; assignees: string[] }) {
  const { busy, error, message, send, router } = useSubmit();
  const [form, setForm] = useState({ land_id: "", listing_ref: "", title: "", deal_value: "", expected_commission: "", assigned_to: "", notes: "" });
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const field = (key: keyof typeof form) => ({ value: form[key], disabled: busy, className: "input", onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setDuplicateId(null);
    const body: Record<string, unknown> = { buyer_lead_id: buyerLeadId };
    for (const key of ["land_id", "listing_ref", "title", "assigned_to", "notes"] as const) if (form[key].trim()) body[key] = form[key].trim();
    for (const key of ["deal_value", "expected_commission"] as const) if (form[key].trim()) body[key] = money(form[key]);
    const result = await send("/api/admin/deals", "POST", body);
    if (result?.ok) router.push(`/admin/deals/${result.data.id}`);
    else if (result?.data?.code === "duplicate_deal") setDuplicateId(result.data.id ?? null);
  }
  return <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">สร้างดีลจากลีดผู้ซื้อนี้</h2>
    <p className="text-sm text-slate-600">ระบุ land_id ของทรัพย์ในระบบ หรือรหัส/ชื่อประกาศ อย่างน้อยหนึ่งอย่าง</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="min-w-0"><span className="label">land_id (UUID)</span><input {...field("land_id")} autoComplete="off" spellCheck={false} /></label>
      <label className="min-w-0"><span className="label">รหัสประกาศ</span><input {...field("listing_ref")} maxLength={80} /></label>
      <label className="min-w-0"><span className="label">ชื่อทรัพย์</span><input {...field("title")} maxLength={200} /></label>
      <label className="min-w-0"><span className="label">มูลค่าดีล (บาท)</span><input {...field("deal_value")} type="number" min={0} step="any" inputMode="decimal" /></label>
      <label className="min-w-0"><span className="label">ค่าคอมฯ ที่คาด (บาท)</span><input {...field("expected_commission")} type="number" min={0} step="any" inputMode="decimal" /></label>
      <label className="min-w-0"><span className="label">ผู้รับผิดชอบ</span><input {...field("assigned_to")} list="deal-create-assignees" maxLength={120} /><Assignees id="deal-create-assignees" values={assignees} /></label>
    </div>
    <label className="block"><span className="label">หมายเหตุ</span><textarea {...field("notes")} rows={2} maxLength={4000} /></label>
    <Feedback error={error} message={message} />
    {duplicateId && <Link href={`/admin/deals/${duplicateId}`} className="text-sm text-brand-600 underline">เปิดดีลที่มีอยู่ →</Link>}
    <button className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy}>{busy ? "กำลังสร้าง..." : "สร้างดีล"}</button>
  </form>;
}

export function DealUpdateForm({ deal, assignees }: { deal: Pick<Deal, "id" | "stage" | "deal_value" | "expected_commission" | "assigned_to" | "notes" | "updated_at">; assignees: string[] }) {
  const { busy, error, message, send } = useSubmit();
  const initial = {
    stage: deal.stage, deal_value: deal.deal_value?.toString() ?? "", expected_commission: deal.expected_commission?.toString() ?? "",
    assigned_to: deal.assigned_to ?? "", notes: deal.notes ?? "",
  };
  const [form, setForm] = useState(initial);
  const field = (key: Exclude<keyof typeof form, "stage">) => ({ value: form[key], disabled: busy, className: "input", onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = { expected_updated_at: deal.updated_at };
    if (form.stage !== initial.stage) body.stage = form.stage;
    for (const key of ["deal_value", "expected_commission"] as const) if (form[key] !== initial[key]) body[key] = money(form[key]);
    if (form.assigned_to.trim() !== initial.assigned_to) body.assigned_to = form.assigned_to.trim() || null;
    if (form.notes !== initial.notes) body.notes = form.notes.trim() || null;
    if (Object.keys(body).length === 1) return;
    await send(`/api/admin/deals/${deal.id}`, "PATCH", body);
  }
  return <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">อัปเดตดีล</h2>
    <label className="block"><span className="label">ขั้นตอน</span>
      <select className="input" value={form.stage} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value as Deal["stage"] }))}>
        {DEAL_STAGES.map((stage) => <option key={stage} value={stage}>{DEAL_STAGE_LABELS[stage]}</option>)}
      </select>
    </label>
    {form.stage === "won" && deal.stage !== "won" && <p className="text-sm text-amber-800">ปิดดีลสำเร็จ: ดีลจะถูกปิด ลีดผู้ซื้อจะเป็น “ปิดการขายสำเร็จ” และนับคอนเวอร์ชันของผู้แนะนำ</p>}
    {form.stage === "lost" && deal.stage !== "lost" && <p className="text-sm text-amber-800">ดีลไม่สำเร็จ: ดีลจะถูกยกเลิก แต่ลีดผู้ซื้อยังติดตามทรัพย์อื่นได้</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="min-w-0"><span className="label">มูลค่าดีล (บาท)</span><input {...field("deal_value")} type="number" min={0} step="any" inputMode="decimal" /></label>
      <label className="min-w-0"><span className="label">ค่าคอมฯ ที่คาด (บาท)</span><input {...field("expected_commission")} type="number" min={0} step="any" inputMode="decimal" /></label>
      <label className="min-w-0"><span className="label">ผู้รับผิดชอบ</span><input {...field("assigned_to")} list="deal-assignees" maxLength={120} /><Assignees id="deal-assignees" values={assignees} /></label>
    </div>
    <label className="block"><span className="label">หมายเหตุ (เฉพาะผู้ดูแล)</span><textarea {...field("notes")} rows={4} maxLength={4000} /></label>
    <Feedback error={error} message={message} />
    <button className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
  </form>;
}
