"use client";

import Link from "next/link";
import { useState } from "react";
import { landSearchParams, type LandFilters } from "@/lib/land-search";
import { SAVED_SEARCH_ALERT_NOTICE, saveBrowserSearch } from "@/lib/saved-searches";

export default function SaveSearchForm({ filters }: { filters: LandFilters }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = landSearchParams(filters).toString();

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      saveBrowserSearch({ name: form.get("name"), search_params: query, alert_requested: form.get("alerts") === "on" });
      setMessage("บันทึกในเบราว์เซอร์นี้แล้ว");
    } catch {
      setMessage("บันทึกไม่ได้ กรุณาตรวจสอบข้อมูลและการอนุญาตจัดเก็บของเบราว์เซอร์");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card p-4 mb-6">
      <summary className="cursor-pointer font-medium text-brand-700">บันทึกการค้นหานี้</summary>
      <p className="text-sm text-slate-600 mt-3">{SAVED_SEARCH_ALERT_NOTICE}</p>
      <p className="text-xs text-slate-500 mt-1">บันทึกตัวกรองปัจจุบัน การค้นหาที่มีตัวกรองเหมือนกันจะอัปเดตรายการเดิม</p>
        <form onSubmit={save} className="mt-3 space-y-3">
          <label className="block text-sm">ชื่อการค้นหา
            <input name="name" required maxLength={80} defaultValue="การค้นหาที่ดินของฉัน" className="input mt-1" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input name="alerts" type="checkbox" className="mt-1" />
            <span>บันทึกความสนใจรับแจ้งเตือนไว้ในเบราว์เซอร์ (ยังไม่ส่งอัตโนมัติ)</span>
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกการค้นหา"}</button>
            <Link href="/saved-searches" className="text-sm text-brand-700 hover:underline">จัดการการค้นหาที่บันทึก</Link>
          </div>
          <p role="status" className="text-sm text-slate-700">{message}</p>
        </form>
    </details>
  );
}
