"use client";

import { useState } from "react";
import ListingCard from "@/components/listings/ListingCard";
import type { Land, Province } from "@/lib/types/database";

interface Props {
  provinces: Province[];
  initial?: { property_type?: string; province?: string; min_size_rai?: string; max_size_rai?: string; max_price?: string; max_price_per_rai?: string; zoning?: string };
}

export default function BuyerRequirementForm({ provinces, initial = {} }: Props) {
  const initialProvince = provinces.find((province) => province.slug === initial.province)?.id ?? "";
  const [form, setForm] = useState({
    property_type: initial.property_type ?? "",
    province_id: initialProvince, preferred_locations: "", min_size_rai: initial.min_size_rai ?? "", max_size_rai: initial.max_size_rai ?? "",
    max_price: initial.max_price ?? "", max_price_per_rai: initial.max_price_per_rai ?? "", zoning: initial.zoning ?? "", purpose: "",
    container_access: "", high_voltage: "", water_requirement: "", name: "", phone: "", line_id: "", consent_pdpa: false,
  });
  const [matches, setMatches] = useState<{ full: Land[]; near: Land[] } | null>(null);
  const [requirementId, setRequirementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const number = (value: string) => value === "" ? null : Number(value);
  const bool = (value: string) => value === "" ? null : value === "true";

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMatches(null); setRequirementId("");
    const response = await fetch("/api/buyer-requirements", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        property_type: form.property_type || null, transaction_type: "sale",
        preferred_locations: form.preferred_locations.split(",").map((value) => value.trim()).filter(Boolean),
        province_ids: form.province_id ? [form.province_id] : [], min_size_rai: number(form.min_size_rai), max_size_rai: number(form.max_size_rai),
        max_price: number(form.max_price), max_price_per_rai: number(form.max_price_per_rai), zoning: form.zoning || null,
        purpose: form.purpose || null, container_access: bool(form.container_access), high_voltage: bool(form.high_voltage),
        water_requirement: form.water_requirement || null, name: form.name, phone: form.phone, line_id: form.line_id || null,
        consent_pdpa: form.consent_pdpa,
      }),
    });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(body.error ?? "บันทึกความต้องการไม่สำเร็จ"); return; }
    setRequirementId(typeof body.id === "string" ? body.id : "");
    setMatches(body.matches ?? { full: [], near: [] });
  }

  return <>
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">ประเภททรัพย์</span><select className="input" value={form.property_type} onChange={(e) => set("property_type", e.target.value)}><option value="">ทั้งหมด</option><option value="land">ที่ดิน</option><option value="factory">โรงงาน</option><option value="warehouse">โกดัง</option></select></label>
        <label><span className="label">จังหวัด</span><select className="input" value={form.province_id} onChange={(e) => set("province_id", e.target.value)}><option value="">ทุกจังหวัด</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.name_th}</option>)}</select></label>
        <label><span className="label">ทำเลเพิ่มเติม</span><input className="input" value={form.preferred_locations} onChange={(e) => set("preferred_locations", e.target.value)} placeholder="อำเภอ, ตำบล, นิคม (คั่นด้วย ,)" /></label>
        <label><span className="label">ขนาดขั้นต่ำ (ไร่)</span><input type="number" min="0" step="0.00001" className="input" value={form.min_size_rai} onChange={(e) => set("min_size_rai", e.target.value)} /></label>
        <label><span className="label">ขนาดสูงสุด (ไร่)</span><input type="number" min="0" step="0.00001" className="input" value={form.max_size_rai} onChange={(e) => set("max_size_rai", e.target.value)} /></label>
        <label><span className="label">งบสูงสุด (บาท)</span><input type="number" min="0" className="input" value={form.max_price} onChange={(e) => set("max_price", e.target.value)} /></label>
        <label><span className="label">ราคาสูงสุด/ไร่ (บาท)</span><input type="number" min="0" className="input" value={form.max_price_per_rai} onChange={(e) => set("max_price_per_rai", e.target.value)} /></label>
        <label><span className="label">ผังเมือง</span><select className="input" value={form.zoning} onChange={(e) => set("zoning", e.target.value)}><option value="">ไม่ระบุ</option><option value="purple">ม่วง</option><option value="purple_light">ม่วงอ่อน</option><option value="brown">น้ำตาล</option><option value="orange">ส้ม</option><option value="yellow">เหลือง</option><option value="green">เขียว</option><option value="other">อื่นๆ</option></select></label>
        <label><span className="label">วัตถุประสงค์</span><input className="input" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} /></label>
        <label><span className="label">รถคอนเทนเนอร์เข้าได้</span><select className="input" value={form.container_access} onChange={(e) => set("container_access", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
        <label><span className="label">ไฟฟ้าแรงสูง</span><select className="input" value={form.high_voltage} onChange={(e) => set("high_voltage", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
        <label className="sm:col-span-2"><span className="label">ความต้องการใช้น้ำ</span><input className="input" value={form.water_requirement} onChange={(e) => set("water_requirement", e.target.value)} /></label>
        <label><span className="label">ชื่อ *</span><input required minLength={2} className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span className="label">โทรศัพท์ *</span><input required inputMode="tel" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="label">LINE ID</span><input className="input" value={form.line_id} onChange={(e) => set("line_id", e.target.value)} /></label>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">ระบบจับคู่เฉพาะข้อมูลที่มีอยู่จริงในทรัพย์ ส่วนเงื่อนไขสาธารณูปโภคที่ทรัพย์ยังไม่ได้บันทึก ทีมงานจะตรวจสอบให้ภายหลัง</p>
      <label className="mt-4 flex items-start gap-3 text-sm text-slate-600"><input required type="checkbox" className="mt-1" checked={form.consent_pdpa} onChange={(e) => set("consent_pdpa", e.target.checked)} /><span>ยินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อและจับคู่ทรัพย์ตามนโยบายความเป็นส่วนตัว</span></label>
      <button disabled={busy} className="btn-green mt-5 w-full sm:w-auto">{busy ? "กำลังค้นหา..." : "บันทึกและค้นหาทรัพย์"}</button>
    </form>
    {matches && <section className="mt-10">
      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="font-bold">บันทึกความต้องการเรียบร้อยแล้ว</div>
        <div className="mt-1 text-emerald-800">ทีมงานสามารถใช้ข้อมูลนี้ติดตามและจับคู่กับทรัพย์ที่เผยแพร่จริง{requirementId ? ` · Ref ${requirementId.slice(0, 8)}` : ""}</div>
      </div>
      <h2 className="text-2xl font-black text-slate-950">ผลการจับคู่</h2>
      {matches.full.length ? <div className="mt-5 grid gap-5 md:grid-cols-2">{matches.full.map((land) => <ListingCard key={land.id} land={land} />)}</div> : <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-8 text-center"><h3 className="font-bold text-slate-900">ยังไม่มีทรัพย์ที่ตรงทุกเงื่อนไข</h3><p className="mt-2 text-sm text-slate-500">บันทึกความต้องการแล้ว ทีมงานจะติดต่อเมื่อมีทรัพย์จริงที่ตรงเงื่อนไข</p></div>}
      {matches.near.length > 0 && <><h3 className="mt-9 text-lg font-bold text-slate-900">ทำเลตรง แต่บางเงื่อนไขยังไม่ตรง</h3><p className="mt-1 text-sm text-slate-500">แสดงเฉพาะทรัพย์ในทำเลที่ขอ โดยอาจต่างจากช่วงขนาด งบประมาณ ราคา/ไร่ หรือผังเมือง</p><div className="mt-4 grid gap-5 md:grid-cols-2">{matches.near.map((land) => <ListingCard key={land.id} land={land} />)}</div></>}
    </section>}
  </>;
}
