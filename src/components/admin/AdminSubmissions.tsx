"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PropertySubmission } from "@/lib/types/database";
import { SUBMISSION_STATUS_LABELS } from "@/lib/marketplace/presentation";
import { publishReadinessIssues } from "@/lib/marketplace/listing-workflow";

export default function AdminSubmissions() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PropertySubmission[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login?next=/admin/properties"); return; }
    fetch("/api/admin/property-submissions")
      .then(async (response) => {
        if (response.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "โหลดรายการไม่สำเร็จ");
        setItems(body.submissions ?? []);
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "โหลดรายการไม่สำเร็จ"));
  }, [loading, router, user]);

  if (loading || (!error && items === null)) return <div className="p-12 text-center text-sm text-slate-500">กำลังโหลด...</div>;
  if (error) return <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    {items?.length ? items.map((item) => <Link key={item.id} href={`/admin/properties/${item.id}`} className="grid gap-2 border-b border-slate-100 p-4 last:border-0 hover:bg-slate-50 sm:grid-cols-[1fr_180px_150px]">
      <div><div className="font-bold text-slate-900">{item.title ?? "ยังไม่มีชื่อทรัพย์"}</div><div className="mt-1 text-xs text-slate-500">{item.province?.name_th ?? "ไม่ระบุจังหวัด"} · {item.contact_name ?? "ไม่ระบุผู้ติดต่อ"}</div></div>
      <div className="text-sm text-slate-600">{item.total_rai != null ? `${item.total_rai.toLocaleString("th-TH", { maximumFractionDigits: 5 })} ไร่` : item.usable_area_sqm != null ? `${item.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.` : "ไม่ระบุขนาด"}</div>
      <div className="flex flex-wrap items-start gap-1.5"><span className="badge bg-slate-100 text-slate-700">{SUBMISSION_STATUS_LABELS[item.status]}</span>{item.status === "approved" && (publishReadinessIssues(item).length ? <span className="badge bg-amber-50 text-amber-800">ข้อมูลไม่ครบ</span> : <span className="badge bg-emerald-50 text-emerald-700">พร้อมเผยแพร่</span>)}</div>
    </Link>) : <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีรายการรอตรวจสอบ</div>}
  </div>;
}
