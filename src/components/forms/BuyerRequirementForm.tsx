"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ListingCard from "@/components/listings/ListingCard";
import { buyerRequirementSchema } from "@/lib/marketplace/schemas";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/marketplace/presentation";
import type { BuyerRequirementSubmissionResult, Province } from "@/lib/types/database";

interface Props {
  provinces: Province[];
  initial?: { property_type?: string; province?: string; min_size_rai?: string; max_size_rai?: string; max_price?: string; max_price_per_rai?: string; zoning?: string };
}

export default function BuyerRequirementForm({ provinces, initial = {} }: Props) {
  const initialProvince = provinces.find((province) => province.slug === initial.province)?.id ?? "";
  const initialForm = {
    property_type: initial.property_type ?? "",
    province_ids: initialProvince ? [initialProvince] : [], preferred_locations: "", min_size_rai: initial.min_size_rai ?? "", max_size_rai: initial.max_size_rai ?? "",
    max_price: initial.max_price ?? "", max_price_per_rai: initial.max_price_per_rai ?? "", zoning: initial.zoning ?? "", purpose: "",
    container_access: "", high_voltage: "", water_requirement: "", special_requirements: "", name: "", phone: "", line_id: "", consent_pdpa: false, consent_public: false,
  };
  const [form, setForm] = useState(initialForm);
  const [matches, setMatches] = useState<BuyerRequirementSubmissionResult["matches"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const saving = useRef(false);
  const invalid = (name: string) => ({ "aria-invalid": invalidFields.includes(name) || undefined });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const number = (value: string) => value === "" ? null : Number(value);
  const bool = (value: string) => value === "" ? null : value === "true";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || matches || saving.current || !provinces.length || (initial.province && !initialProvince && !form.province_ids.length)) return;
    saving.current = true;
    const formElement = event.currentTarget as HTMLFormElement;
    setBusy(true); setError(""); setInvalidFields([]);
    try {
      const parsed = buyerRequirementSchema.safeParse({
        property_type: form.property_type || null, transaction_type: "sale",
        preferred_locations: form.preferred_locations.split(",").map((value) => value.trim()).filter(Boolean),
        province_ids: form.province_ids, min_size_rai: number(form.min_size_rai), max_size_rai: number(form.max_size_rai),
        max_price: number(form.max_price), max_price_per_rai: number(form.max_price_per_rai), zoning: form.zoning || null,
        purpose: form.purpose || null, container_access: bool(form.container_access), high_voltage: bool(form.high_voltage),
        water_requirement: form.water_requirement || null, name: form.name, phone: form.phone, line_id: form.line_id || null,
        special_requirements: form.special_requirements || null,
        consent_pdpa: form.consent_pdpa, consent_public: form.consent_public,
      });
      if (!parsed.success) {
        const labels: Record<string, string> = { name: "ชื่อ (อย่างน้อย 2 ตัวอักษร)", phone: "โทรศัพท์ (เบอร์ไทยที่ถูกต้อง)", consent_pdpa: "ความยินยอม PDPA", max_size_rai: "ขนาดสูงสุด (ไม่น้อยกว่าขั้นต่ำ)", min_size_rai: "ขนาดขั้นต่ำ", max_price: "งบสูงสุด", max_price_per_rai: "ราคาสูงสุด/ไร่", preferred_locations: "ทำเล (ไม่เกิน 10 แห่ง แห่งละ 120 ตัวอักษร)", province_ids: "จังหวัด", property_type: "ประเภททรัพย์", zoning: "ผังเมือง" };
        const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
        setInvalidFields(fields);
        setError(`กรุณาตรวจสอบ: ${fields.map((field) => labels[field] || field).join(" · ")}`);
        formElement.querySelector<HTMLElement>(`[name="${fields[0]}"]`)?.focus();
        return;
      }
      const response = await fetch("/api/buyer-requirements", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "บันทึกความต้องการไม่สำเร็จ กรุณาลองใหม่");
        if (body?.field === "province_ids") {
          setInvalidFields(["province_ids"]);
          formElement.querySelector<HTMLElement>('[name="province_ids"]')?.focus();
        }
        return;
      }
      if (body?.status !== "pending_review"
        || !["available", "limited", "unavailable"].includes(body.matches?.status)
        || !Array.isArray(body.matches?.full) || !Array.isArray(body.matches?.near)) {
        setError("ไม่สามารถยืนยันผลการบันทึกได้ กรุณาติดต่อทีมงานก่อนส่งซ้ำ");
        return;
      }
      setMatches(body.matches);
    } catch {
      setError("การเชื่อมต่อขัดข้อง ไม่สามารถยืนยันผลการบันทึกได้ กรุณาติดต่อทีมงานก่อนส่งซ้ำ");
    } finally { saving.current = false; setBusy(false); }
  }

  return <>
    {!matches && <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {(!provinces.length || (initial.province && !initialProvince && !form.province_ids.length)) && <p role="alert" className="mb-5 text-red-700">กรุณาเลือกจังหวัดที่ถูกต้อง หรือโหลดหน้าใหม่หากไม่มีตัวเลือกจังหวัด</p>}
      {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">ประเภททรัพย์ (ซื้อเท่านั้น)</span><select name="property_type" {...invalid("property_type")} className="input" value={form.property_type} onChange={(e) => set("property_type", e.target.value)}><option value="">ทั้งหมด</option>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{PROPERTY_TYPE_LABELS[type]}</option>)}</select></label>
        <fieldset><legend className="label">จังหวัด (เลือกได้สูงสุด 10 จังหวัด · ไม่เลือก = ทุกจังหวัด)</legend><div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3">{provinces.map((province) => <label key={province.id} className="flex items-center gap-2 py-1 text-sm"><input name="province_ids" {...invalid("province_ids")} value={province.id} type="checkbox" checked={form.province_ids.includes(province.id)} disabled={!form.province_ids.includes(province.id) && form.province_ids.length >= 10} onChange={(e) => set("province_ids", e.target.checked ? [...form.province_ids, province.id] : form.province_ids.filter((id) => id !== province.id))} />{province.name_th}</label>)}</div></fieldset>
        <label><span className="label">ทำเลเพิ่มเติม</span><input name="preferred_locations" {...invalid("preferred_locations")} maxLength={1209} className="input" value={form.preferred_locations} onChange={(e) => set("preferred_locations", e.target.value)} placeholder="อำเภอ, ตำบล, นิคม (คั่นด้วย ,)" /></label>
        <label><span className="label">ขนาดขั้นต่ำ (ไร่)</span><input name="min_size_rai" {...invalid("min_size_rai")} type="number" min="0" max="999999999.99999" step="0.00001" className="input" value={form.min_size_rai} onChange={(e) => set("min_size_rai", e.target.value)} /></label>
        <label><span className="label">ขนาดสูงสุด (ไร่)</span><input name="max_size_rai" {...invalid("max_size_rai")} type="number" min="0" max="999999999.99999" step="0.00001" className="input" value={form.max_size_rai} onChange={(e) => set("max_size_rai", e.target.value)} /></label>
        <label><span className="label">งบสูงสุด (บาท)</span><input name="max_price" {...invalid("max_price")} type="number" min="0" max="99999999999999.99" step="0.01" className="input" value={form.max_price} onChange={(e) => set("max_price", e.target.value)} /></label>
        <label><span className="label">ราคาสูงสุด/ไร่ (บาท)</span><input name="max_price_per_rai" {...invalid("max_price_per_rai")} type="number" min="0" max="99999999999999.99" step="0.01" className="input" value={form.max_price_per_rai} onChange={(e) => set("max_price_per_rai", e.target.value)} /></label>
        <label><span className="label">ผังเมือง</span><select name="zoning" {...invalid("zoning")} className="input" value={form.zoning} onChange={(e) => set("zoning", e.target.value)}><option value="">ไม่ระบุ</option><option value="purple">ม่วง</option><option value="purple_light">ม่วงอ่อน</option><option value="brown">น้ำตาล</option><option value="orange">ส้ม</option><option value="yellow">เหลือง</option><option value="green">เขียว</option><option value="other">อื่นๆ</option></select></label>
        <label><span className="label">วัตถุประสงค์</span><input name="purpose" {...invalid("purpose")} maxLength={1000} className="input" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} /></label>
        <label><span className="label">รถคอนเทนเนอร์เข้าได้</span><select name="container_access" {...invalid("container_access")} className="input" value={form.container_access} onChange={(e) => set("container_access", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
        <label><span className="label">ไฟฟ้าแรงสูง</span><select name="high_voltage" {...invalid("high_voltage")} className="input" value={form.high_voltage} onChange={(e) => set("high_voltage", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
        <label className="sm:col-span-2"><span className="label">ความต้องการใช้น้ำ</span><input name="water_requirement" {...invalid("water_requirement")} maxLength={1000} className="input" value={form.water_requirement} onChange={(e) => set("water_requirement", e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="label">ข้อกำหนดพิเศษ (ส่วนตัว)</span><textarea name="special_requirements" {...invalid("special_requirements")} maxLength={2000} className="input" value={form.special_requirements} onChange={(e) => set("special_requirements", e.target.value)} /></label>
        <label><span className="label">ชื่อ *</span><input name="name" {...invalid("name")} required minLength={2} maxLength={120} autoComplete="name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span className="label">โทรศัพท์ *</span><input name="phone" {...invalid("phone")} required type="tel" maxLength={32} autoComplete="tel" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="sm:col-span-2"><span className="label">LINE ID</span><input name="line_id" {...invalid("line_id")} maxLength={100} className="input" value={form.line_id} onChange={(e) => set("line_id", e.target.value)} /></label>
      </div>
      <p className="mt-4 text-sm text-slate-600">ทุกคำขอจะรอตรวจสอบ และยังไม่เผยแพร่ แม้ยินยอมให้เผยแพร่ ทีมงานต้องตรวจสอบและอนุมัติก่อน</p><p className="mt-4 text-xs leading-5 text-slate-500">ระบบจับคู่เฉพาะข้อมูลที่มีอยู่จริงในทรัพย์ ส่วนเงื่อนไขสาธารณูปโภคที่ทรัพย์ยังไม่ได้บันทึก ทีมงานจะตรวจสอบให้ภายหลัง</p>
      <label className="mt-4 flex items-start gap-3 text-sm text-slate-600"><input name="consent_pdpa" {...invalid("consent_pdpa")} required type="checkbox" className="mt-1" checked={form.consent_pdpa} onChange={(e) => set("consent_pdpa", e.target.checked)} /><span>ยินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อและจับคู่ทรัพย์ตาม<Link href="/privacy" className="underline">นโยบายความเป็นส่วนตัว</Link></span></label>
      <label className="mt-4 flex items-start gap-3 text-sm text-slate-600"><input name="consent_public" {...invalid("consent_public")} type="checkbox" className="mt-1" checked={form.consent_public} onChange={(e) => set("consent_public", e.target.checked)} /><span>ยินยอมให้ทีมงานเผยแพร่เงื่อนไขซื้อแบบไม่ระบุตัวตนหลังตรวจสอบ (ไม่บังคับ) เผยแพร่เฉพาะประเภททรัพย์ จังหวัด ขนาด งบ ผังเมือง รถคอนเทนเนอร์ และไฟฟ้า ไม่เผยแพร่ชื่อ เบอร์ LINE ทำเลที่พิมพ์ หรือข้อความอื่น</span></label>
      <button disabled={busy || !provinces.length || Boolean(initial.province && !initialProvince && !form.province_ids.length)} className="btn-green mt-5 w-full sm:w-auto">{busy ? "กำลังค้นหา..." : "บันทึกและค้นหาทรัพย์"}</button>
    </form>}
    {matches && <section role="status" aria-live="polite" className="mt-2">
      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="font-bold">บันทึกความต้องการแล้ว · รอตรวจสอบ · ยังไม่เผยแพร่</div>
        <div className="mt-1 text-emerald-800">ทีมงานสามารถใช้ข้อมูลนี้ติดตามและจับคู่กับทรัพย์ที่เผยแพร่จริง</div>
      </div>
      <button type="button" className="btn-outline mb-5" onClick={() => { setForm(initialForm); setMatches(null); setError(""); setInvalidFields([]); }}>ส่งคำขอใหม่</button>
      {matches.status !== "available" && <p role="status" className="mb-4 text-amber-800">{matches.status === "unavailable" ? "บันทึกแล้ว แต่ค้นหาทรัพย์ไม่ได้ในขณะนี้ ทีมงานจะติดตามให้" : "แสดงผลสูงสุด 12 รายการต่อกลุ่ม จากทรัพย์สูงสุด 1,000 รายการในพื้นที่ที่ขอ ไม่ใช่ผลทั้งหมด"}</p>}
      {matches.status !== "unavailable" && <>
      <h2 className="text-2xl font-black text-slate-950">ผลการจับคู่</h2>
      {matches.full.length ? <div className="mt-5 grid gap-5 md:grid-cols-2">{matches.full.map((land) => <ListingCard key={land.id} land={land} />)}</div> : <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-8 text-center"><h3 className="font-bold text-slate-900">ยังไม่พบทรัพย์ที่ตรงทุกเงื่อนไขในผลที่ค้นหา</h3><p className="mt-2 text-sm text-slate-500">บันทึกความต้องการแล้ว ทีมงานจะติดต่อเมื่อมีทรัพย์จริงที่ตรงเงื่อนไข</p></div>}
      {matches.near.length > 0 && <><h3 className="mt-9 text-lg font-bold text-slate-900">ทำเลตรง แต่บางเงื่อนไขยังไม่ตรง</h3><p className="mt-1 text-sm text-slate-500">แสดงเฉพาะทรัพย์ในทำเลที่ขอ โดยอาจต่างจากช่วงขนาด งบประมาณ ราคา/ไร่ หรือผังเมือง</p><div className="mt-4 grid gap-5 md:grid-cols-2">{matches.near.map((land) => <ListingCard key={land.id} land={land} />)}</div></>}
      </>}
    </section>}
  </>;
}
