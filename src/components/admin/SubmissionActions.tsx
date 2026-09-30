"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SubmissionStatus } from "@/lib/types/database";

const labels = { approve: "อนุมัติ", reject: "ปฏิเสธ", publish: "เผยแพร่", sold: "ขายแล้ว", expired: "หมดอายุ" } as const;

export default function SubmissionActions({ id, status }: { id: string; status: SubmissionStatus }) {
  const { sessionToken } = useAuth();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actions = status === "pending_review" ? ["approve", "reject"] as const
    : status === "approved" ? ["publish"] as const
      : status === "published" ? ["sold", "expired"] as const
        : [];

  async function act(action: typeof actions[number]) {
    if (action === "reject" && !note.trim()) {
      setError("กรุณาระบุเหตุผลก่อนปฏิเสธรายการ");
      return;
    }
    if (!confirm(`ยืนยัน: ${labels[action]}`)) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/admin/property-submissions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}) },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error ?? "ดำเนินการไม่สำเร็จ"); return; }
    window.location.reload();
  }

  if (!actions.length) return null;
  return <div className="mt-5 space-y-3">
    {status === "pending_review" && <textarea className="input min-h-24" value={note} onChange={(event) => setNote(event.target.value)} placeholder="หมายเหตุการตรวจสอบ (ถ้ามี)" />}
    {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      {actions.map((action) => <button key={action} type="button" disabled={busy} onClick={() => void act(action)} className={`${action === "reject" || action === "expired" ? "btn-outline" : "btn-green"} w-full justify-center sm:w-auto`}>{labels[action]}</button>)}
    </div>
  </div>;
}
