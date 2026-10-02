"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PropertySubmission } from "@/lib/types/database";
import { PROPERTY_TYPE_LABELS, SUBMISSION_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/marketplace/presentation";
import { publishReadinessIssues } from "@/lib/marketplace/listing-workflow";
import { submissionVerification } from "@/lib/marketplace/verification";
import { formatUpdatedDate } from "@/lib/utils";
import VerificationChecklist from "@/components/listings/VerificationChecklist";
import SubmissionActions from "./SubmissionActions";

export default function AdminSubmissionDetail({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<PropertySubmission | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace(`/login?next=/admin/properties/${id}`); return; }
    fetch(`/api/admin/property-submissions/${id}`)
      .then(async (response) => {
        if (response.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ");
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setItem(body.submission);
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [id, loading, router, user]);
  if (loading || (!error && !item)) return <div className="p-12 text-center text-sm text-slate-500">กำลังโหลด...</div>;
  if (error || !item) return <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  const facts = [
    ["ประเภท", item.property_type && item.transaction_type ? `${(PROPERTY_TYPE_LABELS[item.property_type] ?? PROPERTY_TYPE_LABELS.other)} / ${TRANSACTION_TYPE_LABELS[item.transaction_type]}` : "-"],
    ["ที่ตั้ง", [item.address, item.subdistrict, item.district, item.province?.name_th].filter(Boolean).join(" · ") || "-"],
    ["ขนาด", [
      item.total_rai != null && `${item.total_rai.toLocaleString("th-TH", { maximumFractionDigits: 5 })} ไร่`,
      item.usable_area_sqm != null && `พื้นที่ใช้สอย ${item.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.`,
    ].filter(Boolean).join(" · ") || "-"],
    ["ราคาขาย", item.sale_price != null ? `${item.sale_price.toLocaleString("th-TH")} บาท` : "-"],
    ["ราคา / ไร่", item.price_per_rai != null ? `${item.price_per_rai.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท` : "-"],
    ["พิกัด", item.lat != null && item.lng != null ? `${item.lat.toFixed(7)}, ${item.lng.toFixed(7)} · ${item.location_precision === "exact" ? "พิกัดแบบ Exact" : "โดยประมาณ"}` : "ไม่ได้ระบุ"],
    ["ผู้ติดต่อ", [item.contact_name, item.contact_phone, item.contact_line].filter(Boolean).join(" · ") || "-"],
    ["ไทม์ไลน์", [
      item.submitted_at && `ส่ง ${formatUpdatedDate(item.submitted_at)}`,
      item.reviewed_at && `ตรวจ ${formatUpdatedDate(item.reviewed_at)}`,
      item.published_at && `เผยแพร่ ${formatUpdatedDate(item.published_at)}`,
      `อัปเดต ${formatUpdatedDate(item.updated_at) ?? "-"}`,
    ].filter(Boolean).join(" · ")],
  ];
  const publishIssues = publishReadinessIssues(item);
  return <><Link href="/admin/properties" className="text-sm font-bold text-slate-500">← กลับรายการ</Link><div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-2xl font-black text-slate-950">{item.title ?? "ยังไม่มีชื่อทรัพย์"}</h1><span className="badge bg-slate-100 text-slate-700">{SUBMISSION_STATUS_LABELS[item.status]}</span></div>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2">{facts.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-800">{value}</dd></div>)}</dl>
    {item.description && <div className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-600">{item.description}</div>}
    {item.media?.length ? <div className="mt-5"><h2 className="font-bold">ไฟล์แนบ</h2><ul className="mt-2 divide-y rounded-xl border border-slate-200">{item.media.map((media) => <li key={media.id} className="flex min-w-0 justify-between gap-3 px-4 py-3 text-sm"><span className="min-w-0 truncate">{media.file_name}</span><span className="shrink-0 text-slate-400">{media.media_kind}</span></li>)}</ul></div> : null}
    <div className="mt-6"><h2 className="font-bold">การตรวจสอบรายมิติ</h2><div className="mt-2"><VerificationChecklist dimensions={submissionVerification(item)} /></div></div>
    {item.status === "approved" && <div className={`mt-5 rounded-xl p-4 text-sm ${publishIssues.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{publishIssues.length ? `ความพร้อมเผยแพร่: ขาด ${publishIssues.join(", ")}` : "ความพร้อมเผยแพร่: ครบถ้วน"}</div>}
    {item.review_note && <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">หมายเหตุ: {item.review_note}</div>}
    <SubmissionActions id={item.id} status={item.status} publishIssues={publishIssues} />
  </div></>;
}
