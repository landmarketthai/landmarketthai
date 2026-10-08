"use client";

import { useState } from "react";
import { zoningSchema, ZONING_NOTICE, ZONING_STATUS_LABELS, type ZoningInfo } from "@/lib/zoning";
import { ZONING_LABELS } from "@/lib/utils";
import type { ZoningColor } from "@/lib/types/database";

export default function ZoningFields({ initial, value, onChange, review = false }: { initial?: ZoningInfo; value?: ZoningInfo; onChange?: (value: ZoningInfo) => void; review?: boolean }) {
  const [localInfo, setInfo] = useState(initial ?? zoningSchema.parse({}));
  const info = value ?? localInfo;
  function update(next: ZoningInfo) { setInfo(next); onChange?.(next); }
  return <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
    <legend className="px-2 font-bold">ข้อมูลผังเมือง</legend>
    <input type="hidden" name="zoning_info" value={JSON.stringify(info)} />
    <p className="text-sm text-slate-600">กรอกเท่าที่ทราบ เลือกได้หลายสี เว้นรหัสประเภทและชื่อผังเมื่อยังไม่มีข้อมูล</p>
    {info.zones.map((zone, index) => <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
      <label className="text-sm">สีผังเมือง {index + 1}<select className="input mt-1" value={zone.color ?? ""} onChange={event => update({ ...info, zones: info.zones.map((item, i) => i === index ? { ...item, color: event.target.value as ZoningColor || null } : item) })}>
        <option value="">ยังไม่ทราบสี</option>{Object.entries(ZONING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {(["type_code", "type_name"] as const).map(field => <label key={field} className="text-sm">{field === "type_code" ? "รหัสประเภท" : "ชื่อประเภท"}<input className="input mt-1" maxLength={500} value={zone[field]} onChange={event => update({ ...info, zones: info.zones.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item) })} /></label>)}
      <button type="button" className="min-h-11 text-sm text-red-700" onClick={() => update({ ...info, zones: info.zones.filter((_, i) => i !== index) })}>ลบรายการสี {index + 1}</button>
    </div>)}
    <button type="button" disabled={info.zones.length >= 20} className="btn-outline text-sm" onClick={() => update({ ...info, zones: [...info.zones, { color: null, type_code: "", type_name: "" }] })}>เพิ่มสี / ประเภท</button>
    <label className="block text-sm">สถานะข้อมูล<select className="input mt-1" value={info.status} onChange={event => update({ ...info, status: event.target.value as ZoningInfo["status"] })}>
      {Object.entries(ZONING_STATUS_LABELS).filter(([value]) => review || value === "unknown" || value === "owner_reported").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {(["plan_name", "source", "checked_at", "evidence_url"] as const).map(field => <label key={field} className="block text-sm">
      {{ plan_name: "ชื่อผัง", source: "แหล่งข้อมูล (จะแสดงสาธารณะ)", checked_at: "วันที่ตรวจข้อมูล", evidence_url: "ลิงก์แผนที่ / เอกสารยืนยัน (สาธารณะ)" }[field]}
      <input className="input mt-1" type={field === "checked_at" ? "date" : field === "evidence_url" ? "url" : "text"} maxLength={field === "evidence_url" ? 2000 : 500} value={info[field]} onChange={event => update({ ...info, [field]: event.target.value })} />
    </label>)}
    <p className="text-xs text-slate-600">{ZONING_NOTICE} {review ? "สถานะตรวจจากแผนที่หรือมีเอกสารยืนยันต้องระบุแหล่งข้อมูล วันที่ตรวจ และลิงก์หลักฐาน" : "หลักฐานที่ส่งเป็นข้อมูลจากผู้ประกาศ ทีมงานต้องตรวจสอบก่อนยกระดับสถานะ"}</p>
  </fieldset>;
}
