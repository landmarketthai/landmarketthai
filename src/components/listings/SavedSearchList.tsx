"use client";

import Link from "next/link";
import { useState } from "react";
import { SAVED_SEARCH_ALERT_NOTICE, type SavedSearch } from "@/lib/saved-searches";

export default function SavedSearchList({ searches }: { searches: SavedSearch[] }) {
  const [items, setItems] = useState(searches);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function change(item: SavedSearch, remove = false) {
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/saved-searches", {
        method: remove ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? { id: item.id } : { id: item.id, alert_requested: !item.alert_requested }),
      });
      if (!response.ok) {
        setMessage("แก้ไขไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setItems(current => remove ? current.filter(search => search.id !== item.id)
        : current.map(search => search.id === item.id ? { ...search, alert_requested: !item.alert_requested } : search));
      setMessage(remove ? "ลบการค้นหาแล้ว" : "บันทึกความสนใจแล้ว");
    } catch {
      setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600 mb-6">{SAVED_SEARCH_ALERT_NOTICE}</p>
      <p role="status" className="text-sm text-slate-700 mb-3">{message}</p>
      {!items.length && <p className="card p-6">ยังไม่มีการค้นหาที่บันทึก <Link href="/land" className="text-brand-700 underline">ค้นหาที่ดิน</Link></p>}
      <ul className="space-y-4">
        {items.map(item => (
          <li key={item.id} className="card p-5">
            <h2 className="font-semibold">{item.name}</h2>
            <p className="text-sm text-slate-500 mt-1">{item.alert_requested ? "ขอรับแจ้งเตือนไว้แล้ว — รอเปิดบริการ" : "บันทึกการค้นหาเท่านั้น"}</p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
              <Link href={`/land${item.search_params ? `?${item.search_params}` : ""}`} className="btn-ghost">เปิดผลการค้นหาล่าสุด</Link>
              <button disabled={busy !== null} onClick={() => change(item)} className="text-brand-700 hover:underline disabled:opacity-50">
                {item.alert_requested ? "ยกเลิกความสนใจรับแจ้งเตือน" : "ขอรับแจ้งเตือนเมื่อเปิดบริการ"}
              </button>
              <button disabled={busy !== null} onClick={() => change(item, true)} className="text-red-700 hover:underline disabled:opacity-50">ลบ</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
