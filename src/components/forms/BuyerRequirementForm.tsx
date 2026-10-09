"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ListingCard from "@/components/listings/ListingCard";
import { buyerRequirementSchema } from "@/lib/marketplace/schemas";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/marketplace/presentation";
import type { BuyerRequirementSubmissionResult, Province } from "@/lib/types/database";

interface Props {
  provinces: Province[];
  initial?: { property_type?: string; province?: string; min_size_rai?: string; max_size_rai?: string; min_usable_area_sqm?: string; max_usable_area_sqm?: string; max_price?: string; max_price_per_rai?: string; zoning?: string };
}

// Turnstile is wired without extra imports/hooks (existing tests load this file with a minimal React mock).
// Inert unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the widget injects a hidden cf-turnstile-response input into the form.
// Next inlines the NEXT_PUBLIC_ value at build time; the catch only matters outside Next (isolated tests).
const TURNSTILE_SITE_KEY = (() => { try { return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || ""; } catch { return ""; } })();
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
function mountTurnstile(el: HTMLDivElement | null) {
  if (!el || el.childElementCount) return;
  const render = () => { if (!el.childElementCount) window.turnstile?.render(el, { sitekey: TURNSTILE_SITE_KEY, appearance: "interaction-only", action: "buyer-requirement" }); };
  if (window.turnstile) return render();
  let script = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
  if (!script) { script = document.createElement("script"); script.src = TURNSTILE_SRC; script.async = true; document.head.appendChild(script); }
  script.addEventListener("load", render, { once: true });
}
const resetTurnstile = () => { if (TURNSTILE_SITE_KEY) window.turnstile?.reset(); };

export default function BuyerRequirementForm({ provinces, initial = {} }: Props) {
  const initialProvince = provinces.find((province) => province.slug === initial.province)?.id ?? "";
  const initialForm = {
    property_type: initial.property_type ?? "",
    province_ids: initialProvince ? [initialProvince] : [], preferred_locations: "", min_size_rai: initial.min_size_rai ?? "", max_size_rai: initial.max_size_rai ?? "",
    min_usable_area_sqm: initial.min_usable_area_sqm ?? "", max_usable_area_sqm: initial.max_usable_area_sqm ?? "",
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
        min_usable_area_sqm: number(form.min_usable_area_sqm), max_usable_area_sqm: number(form.max_usable_area_sqm),
        max_price: number(form.max_price), max_price_per_rai: number(form.max_price_per_rai), zoning: form.zoning || null,
        purpose: form.purpose || null, container_access: bool(form.container_access), high_voltage: bool(form.high_voltage),
        water_requirement: form.water_requirement || null, name: form.name, phone: form.phone, line_id: form.line_id || null,
        special_requirements: form.special_requirements || null,
        consent_pdpa: form.consent_pdpa, consent_public: form.consent_public,
      });
      if (!parsed.success) {
        const labels: Record<string, string> = { name: "ชื่อ (อย่างน้อย 2 ตัวอักษร)", phone: "โทรศัพท์ (เบอร์ไทยที่ถูกต้อง)", consent_pdpa: "ความยินยอม PDPA", max_size_rai: "ขนาดสูงสุด (ไม่น้อยกว่าขั้นต่ำ)", min_size_rai: "ขนาดขั้นต่ำ", min_usable_area_sqm: "พื้นที่ใช้สอยขั้นต่ำ", max_usable_area_sqm: "พื้นที่ใช้สอยสูงสุด (ไม่น้อยกว่าขั้นต่ำ)", max_price: "งบสูงสุด", max_price_per_rai: "ราคาสูงสุด/ไร่", preferred_locations: "ทำเล (ไม่เกิน 10 แห่ง แห่งละ 120 ตัวอักษร)", province_ids: "จังหวัด", property_type: "ประเภททรัพย์", zoning: "ผังเมือง" };
        const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
        setInvalidFields(fields);
        setError(`กรุณาตรวจสอบ: ${fields.map((field) => labels[field] || field).join(" · ")}`);
        const target = formElement.querySelector<HTMLElement>(`[name="${fields[0]}"]`);
        target?.closest?.("details")?.setAttribute("open", "");
        target?.focus();
        return;
      }
      const humanToken = TURNSTILE_SITE_KEY ? formElement.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? "" : "";
      if (TURNSTILE_SITE_KEY && !humanToken) { setError("กรุณารอการยืนยันว่าคุณไม่ใช่บอท แล้วลองอีกครั้ง"); return; }
      const response = await fetch("/api/buyer-requirements", {
        method: "POST", headers: { "content-type": "application/json", ...(humanToken ? { "x-turnstile-token": humanToken } : {}) },
        body: JSON.stringify(parsed.data),
      });
      resetTurnstile();
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
      resetTurnstile();
      setError("การเชื่อมต่อขัดข้อง ไม่สามารถยืนยันผลการบันทึกได้ กรุณาติดต่อทีมงานก่อนส่งซ้ำ");
    } finally { saving.current = false; setBusy(false); }
  }

  return <>
    {!matches && <form onSubmit={submit} className="-mx-4 border-b border-slate-200 bg-white px-4 py-6 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:border sm:p-8 sm:shadow-sm">
      {(!provinces.length || (initial.province && !initialProvince && !form.province_ids.length)) && <p role="alert" className="mb-5 text-red-700">กรุณาเลือกจังหวัดที่ถูกต้อง หรือโหลดหน้าใหม่หากไม่มีตัวเลือกจังหวัด</p>}
      {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <h2 className="text-lg font-black text-[#06235f]">ที่ดินที่ต้องการ</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className="label">ประเภททรัพย์</span><select name="property_type" {...invalid("property_type")} className="input" value={form.property_type} onChange={(e) => set("property_type", e.target.value)}><option value="">ทุกประเภท</option>{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{PROPERTY_TYPE_LABELS[type]}</option>)}</select></label>
        {/* ponytail: one province covers most buyers; multi-select stays under "more conditions" and shares province_ids */}
        <label><span className="label">จังหวัด</span><select name="province_ids" {...invalid("province_ids")} className="input" value={form.province_ids[0] ?? ""} onChange={(e) => set("province_ids", e.target.value ? [e.target.value] : [])}><option value="">ทุกจังหวัด</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.name_th}</option>)}</select>{form.province_ids.length > 1 && <span className="mt-1 block text-xs text-slate-500">+ อีก {form.province_ids.length - 1} จังหวัด</span>}</label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">ขนาดตั้งแต่ (ไร่)</span><input name="min_size_rai" {...invalid("min_size_rai")} type="number" inputMode="decimal" min="0" max="999999999.99999" step="0.00001" className="input" value={form.min_size_rai} onChange={(e) => set("min_size_rai", e.target.value)} /></label>
          <label><span className="label">ถึง (ไร่)</span><input name="max_size_rai" {...invalid("max_size_rai")} type="number" inputMode="decimal" min="0" max="999999999.99999" step="0.00001" className="input" value={form.max_size_rai} onChange={(e) => set("max_size_rai", e.target.value)} /></label>
        </div>
        <label><span className="label">งบประมาณสูงสุด (บาท)</span><input name="max_price" {...invalid("max_price")} type="number" inputMode="numeric" min="0" max="99999999999999.99" step="0.01" className="input" placeholder="เช่น 100,000,000" value={form.max_price} onChange={(e) => set("max_price", e.target.value)} /></label>
      </div>

      <details className="group mt-5 rounded-xl border border-slate-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">เงื่อนไขเพิ่มเติม (ไม่บังคับ)<span className="transition-transform group-open:rotate-180">▾</span></summary>
        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <fieldset className="sm:col-span-2"><legend className="label">เลือกหลายจังหวัด (สูงสุด 10)</legend><div className="grid max-h-40 grid-cols-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-3">{provinces.map((province) => <label key={province.id} className="flex min-h-9 items-center gap-2 text-sm"><input name="province_ids" {...invalid("province_ids")} value={province.id} type="checkbox" checked={form.province_ids.includes(province.id)} disabled={!form.province_ids.includes(province.id) && form.province_ids.length >= 10} onChange={(e) => set("province_ids", e.target.checked ? [...form.province_ids, province.id] : form.province_ids.filter((id) => id !== province.id))} />{province.name_th}</label>)}</div></fieldset>
          <label className="sm:col-span-2"><span className="label">ทำเลที่สนใจ</span><input name="preferred_locations" {...invalid("preferred_locations")} maxLength={1209} className="input" value={form.preferred_locations} onChange={(e) => set("preferred_locations", e.target.value)} placeholder="อำเภอ, ตำบล, นิคม (คั่นด้วย ,)" /></label>
          <label><span className="label">ราคาสูงสุด/ไร่ (บาท)</span><input name="max_price_per_rai" {...invalid("max_price_per_rai")} type="number" inputMode="numeric" min="0" max="99999999999999.99" step="0.01" className="input" value={form.max_price_per_rai} onChange={(e) => set("max_price_per_rai", e.target.value)} /></label>
          <label><span className="label">ผังเมือง</span><select name="zoning" {...invalid("zoning")} className="input" value={form.zoning} onChange={(e) => set("zoning", e.target.value)}><option value="">ไม่ระบุ</option><option value="purple">ม่วง</option><option value="purple_light">ม่วงอ่อน</option><option value="brown">น้ำตาล</option><option value="orange">ส้ม</option><option value="yellow">เหลือง</option><option value="green">เขียว</option><option value="other">อื่นๆ</option></select></label>
          <label><span className="label">รถคอนเทนเนอร์เข้าได้</span><select name="container_access" {...invalid("container_access")} className="input" value={form.container_access} onChange={(e) => set("container_access", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
          <label><span className="label">ไฟฟ้าแรงสูง</span><select name="high_voltage" {...invalid("high_voltage")} className="input" value={form.high_voltage} onChange={(e) => set("high_voltage", e.target.value)}><option value="">ไม่ระบุ</option><option value="true">ต้องการ</option><option value="false">ไม่จำเป็น</option></select></label>
          {([['min_usable_area_sqm', 'พื้นที่ใช้สอยตั้งแต่ (ตร.ม.)'], ['max_usable_area_sqm', 'พื้นที่ใช้สอยถึง (ตร.ม.)']] as const).map(([name, label]) => <label key={name}><span className="label">{label}</span><input name={name} {...invalid(name)} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" className="input" value={form[name]} onChange={(e) => set(name, e.target.value)} /></label>)}
          <label><span className="label">วัตถุประสงค์</span><input name="purpose" {...invalid("purpose")} maxLength={1000} className="input" placeholder="เช่น สร้างโรงงาน คลังสินค้า" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} /></label>
          <label><span className="label">ความต้องการใช้น้ำ</span><input name="water_requirement" {...invalid("water_requirement")} maxLength={1000} className="input" value={form.water_requirement} onChange={(e) => set("water_requirement", e.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">รายละเอียดอื่น (ทีมงานเห็นเท่านั้น)</span><textarea name="special_requirements" {...invalid("special_requirements")} maxLength={2000} className="input" value={form.special_requirements} onChange={(e) => set("special_requirements", e.target.value)} /></label>
          <label className="flex items-start gap-3 text-sm text-slate-600 sm:col-span-2"><input name="consent_public" {...invalid("consent_public")} type="checkbox" className="mt-1" checked={form.consent_public} onChange={(e) => set("consent_public", e.target.checked)} /><span>ให้ทีมงานเผยแพร่เงื่อนไขซื้อแบบไม่ระบุตัวตน เพื่อให้เจ้าของที่ดินติดต่อเข้ามา (เผยแพร่เฉพาะประเภท จังหวัด ขนาด งบ ผังเมือง รถคอนเทนเนอร์ และไฟฟ้า ไม่เผยแพร่ชื่อ เบอร์ หรือข้อความ)</span></label>
        </div>
      </details>

      <h2 className="mt-8 text-lg font-black text-[#06235f]">ติดต่อกลับ</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label><span className="label">ชื่อ *</span><input name="name" {...invalid("name")} required minLength={2} maxLength={120} autoComplete="name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span className="label">โทรศัพท์ *</span><input name="phone" {...invalid("phone")} required type="tel" maxLength={32} autoComplete="tel" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label><span className="label">LINE ID</span><input name="line_id" {...invalid("line_id")} maxLength={100} className="input" value={form.line_id} onChange={(e) => set("line_id", e.target.value)} /></label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm text-slate-600"><input name="consent_pdpa" {...invalid("consent_pdpa")} required type="checkbox" className="mt-1" checked={form.consent_pdpa} onChange={(e) => set("consent_pdpa", e.target.checked)} /><span>ยินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อและจับคู่ทรัพย์ตาม<Link href="/privacy" className="underline">นโยบายความเป็นส่วนตัว</Link></span></label>
      {TURNSTILE_SITE_KEY ? <div ref={mountTurnstile} className="mt-5" /> : null}
      <button disabled={busy || !provinces.length || Boolean(initial.province && !initialProvince && !form.province_ids.length)} className="btn-green mt-5 w-full text-base">{busy ? "กำลังค้นหา..." : "บันทึกและค้นหาที่ดินที่ตรง"}</button>
      <p className="mt-3 text-center text-xs text-slate-500">ทีมงานตรวจสอบทุกคำขอก่อน และไม่เผยแพร่ข้อมูลติดต่อของคุณ</p>
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
