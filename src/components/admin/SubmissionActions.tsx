"use client";

import { useState } from "react";
import type { SubmissionStatus } from "@/lib/types/database";
import { ADMIN_ACTION_LABELS, allowedAdminActions, type AdminAction } from "@/lib/marketplace/listing-workflow";

const OUTLINE_ACTIONS: AdminAction[] = ["reject", "archive"];

export default function SubmissionActions({ id, status, publishIssues }: { id: string; status: SubmissionStatus; publishIssues: string[] }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actions = allowedAdminActions(status);

  async function act(action: AdminAction) {
    if (action === "reject" && !note.trim()) {
      setError("กรุณาระบุเหตุผลก่อนปฏิเสธรายการ");
      return;
    }
    if (!confirm(`ยืนยัน: ${ADMIN_ACTION_LABELS[action]}`)) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/property-submissions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error ?? "ดำเนินการไม่สำเร็จ"); return; }
    window.location.reload();
  }

  if (!actions.length) return null;
  return <div className="mt-5 space-y-3">
    {(actions.includes("approve") || actions.includes("reject")) && <textarea className="input min-h-24" value={note} onChange={(event) => setNote(event.target.value)} placeholder="หมายเหตุการตรวจสอบ (จำเป็นเมื่อปฏิเสธ)" />}
    {actions.includes("publish") && publishIssues.length > 0 && <p className="text-sm text-amber-800">เผยแพร่ไม่ได้จนกว่าจะแก้: {publishIssues.join(", ")}</p>}
    {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      {actions.map((action) => <button
        key={action}
        type="button"
        disabled={busy || (action === "publish" && publishIssues.length > 0)}
        onClick={() => void act(action)}
        className={`${OUTLINE_ACTIONS.includes(action) ? "btn-outline" : "btn-green"} w-full justify-center disabled:opacity-50 sm:w-auto`}
      >{ADMIN_ACTION_LABELS[action]}</button>)}
    </div>
    {status === "published" && <p className="text-xs text-slate-500">ขายแล้ว: ประกาศยังคงอยู่และค้นหาได้ในสถานะ “ขายแล้ว” · เก็บถาวร: ซ่อนจากหน้าสาธารณะโดยไม่ลบข้อมูล</p>}
  </div>;
}
