"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { landSearchParams, type LandFilters } from "@/lib/land-search";
import { SAVED_SEARCH_ALERT_NOTICE } from "@/lib/saved-searches";

export default function SaveSearchForm({ filters }: { filters: LandFilters }) {
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = landSearchParams(filters).toString();
  const currentUrl = `/land${query ? `?${query}` : ""}`;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), search_params: query, alert_requested: form.get("alerts") === "on" }),
      });
      setMessage(response.ok ? "บันทึกการค้นหาและความสนใจแล้ว" : response.status === 401 ? "กรุณาเข้าสู่ระบบอีกครั้ง" : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } catch {
      setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card p-4 mb-6">
      <summary className="cursor-pointer font-medium text-brand-700">บันทึกการค้นหานี้</summary>
      <p className="text-sm text-slate-600 mt-3">{SAVED_SEARCH_ALERT_NOTICE}</p>
      <p className="text-xs text-slate-500 mt-1">บันทึกตัวกรองปัจจุบัน การค้นหาที่มีตัวกรองเหมือนกันจะอัปเดตรายการเดิม</p>
      {loading ? <p className="text-sm mt-3">กำลังตรวจสอบบัญชี...</p> : !user ? (
        <Link className="btn-ghost mt-3" href={`/login?next=${encodeURIComponent(currentUrl)}`}>เข้าสู่ระบบเพื่อบันทึก</Link>
      ) : (
        <form onSubmit={save} className="mt-3 space-y-3">
          <label className="block text-sm">ชื่อการค้นหา
            <input name="name" required maxLength={80} defaultValue="การค้นหาที่ดินของฉัน" className="input mt-1" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input name="alerts" type="checkbox" className="mt-1" />
            <span>ขอรับแจ้งเตือนเมื่อระบบเปิดให้บริการ (ยังไม่ส่งอัตโนมัติ)</span>
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกการค้นหา"}</button>
            <Link href="/saved-searches" className="text-sm text-brand-700 hover:underline">จัดการการค้นหาที่บันทึก</Link>
          </div>
          <p role="status" className="text-sm text-slate-700">{message}</p>
        </form>
      )}
    </details>
  );
}
