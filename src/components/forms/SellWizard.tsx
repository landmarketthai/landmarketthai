"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileText, ImagePlus, Info, MapPin, Save, UploadCloud } from "lucide-react";
import type { PropertySubmission, Province, PropertyType, TransactionType, ZoningColor } from "@/lib/types/database";
import LocationPicker, { type MapFocus } from "./LocationPicker";

interface Props { provinces: Province[]; buyerDemandSlug?: string }

/** Approximate administrative center from /api/thai-admin (Open Admin Data, CC-BY-4.0). */
type AreaOption = { name_th: string; lat: number | null; lng: number | null };
type AreaResponse = { province: AreaOption | null; districts: AreaOption[]; subdistricts: AreaOption[] };

async function fetchAreas(province: string, district?: string): Promise<AreaResponse | null> {
  const params = new URLSearchParams({ province });
  if (district) params.set("district", district);
  try {
    const response = await fetch(`/api/thai-admin?${params}`);
    return response.ok ? (await response.json()) as AreaResponse : null;
  } catch { return null; }
}

/** Keep a restored legacy free-text value selectable even when it is not in the dataset. */
function withCurrent(options: AreaOption[], current: string): AreaOption[] {
  return current && !options.some((option) => option.name_th === current) ? [{ name_th: current, lat: null, lng: null }, ...options] : options;
}

function focusOn(area: AreaOption | null | undefined, zoom: number) {
  return (current: MapFocus | null): MapFocus | null => (
    area?.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng, zoom, key: (current?.key ?? 0) + 1 } : current
  );
}

type DraftForm = {
  property_type: PropertyType | null;
  transaction_type: TransactionType | null;
  title: string;
  province_id: string;
  district: string;
  subdistrict: string;
  address: string;
  lat: number | null;
  lng: number | null;
  area_rai: number | null;
  area_ngan: number | null;
  area_sqwa: number | null;
  frontage_m: number | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  road_name: string;
  road_width_m: number | null;
  zoning: ZoningColor | null;
  sale_price: number | null;
  price_per_rai: number | null;
  description: string;
  contact_name: string;
  contact_phone: string;
  contact_line: string;
};

const emptyForm: DraftForm = {
  property_type: null,
  transaction_type: "sale",
  title: "",
  province_id: "",
  district: "",
  subdistrict: "",
  address: "",
  lat: null,
  lng: null,
  area_rai: null,
  area_ngan: null,
  area_sqwa: null,
  frontage_m: null,
  depth_min_m: null,
  depth_max_m: null,
  road_name: "",
  road_width_m: null,
  zoning: null,
  sale_price: null,
  price_per_rai: null,
  description: "",
  contact_name: "",
  contact_phone: "",
  contact_line: "",
};

const steps = ["ประเภททรัพย์", "ตำแหน่ง", "รายละเอียดและราคา", "รูปและเอกสาร", "ข้อมูลติดต่อ", "ตรวจสอบและส่ง"];

function fromDraft(draft: PropertySubmission): DraftForm {
  return {
    property_type: draft.property_type,
    transaction_type: "sale",
    title: draft.title ?? "",
    province_id: draft.province_id ?? "",
    district: draft.district ?? "",
    subdistrict: draft.subdistrict ?? "",
    address: draft.address ?? "",
    lat: draft.lat,
    lng: draft.lng,
    area_rai: draft.area_rai,
    area_ngan: draft.area_ngan,
    area_sqwa: draft.area_sqwa,
    frontage_m: draft.frontage_m,
    depth_min_m: draft.depth_min_m,
    depth_max_m: draft.depth_max_m,
    road_name: draft.road_name ?? "",
    road_width_m: draft.road_width_m,
    zoning: draft.zoning,
    sale_price: draft.sale_price,
    price_per_rai: draft.price_per_rai,
    description: draft.description ?? "",
    contact_name: draft.contact_name ?? "",
    contact_phone: draft.contact_phone ?? "",
    contact_line: draft.contact_line ?? "",
  };
}

export default function SellWizard({ provinces, buyerDemandSlug }: Props) {
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState<PropertySubmission | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [districtData, setDistrictData] = useState<{ province: string; items: AreaOption[] }>({ province: "", items: [] });
  const [subdistrictData, setSubdistrictData] = useState<{ key: string; items: AreaOption[] }>({ key: "", items: [] });
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const focusProvinceOnLoad = useRef<string | null>(null);

  const provinceName = provinces.find((province) => province.id === form.province_id)?.name_th ?? "";
  const isBangkok = provinceName.replace(/^จังหวัด\s*/, "").startsWith("กรุงเทพ");
  const districtLabel = isBangkok ? "เขต" : "อำเภอ";
  const subdistrictLabel = isBangkok ? "แขวง" : "ตำบล";
  const subdistrictKey = `${provinceName}|${form.district}`;
  const districtOptions = withCurrent(districtData.province === provinceName ? districtData.items : [], form.district);
  const subdistrictOptions = withCurrent(subdistrictData.key === subdistrictKey ? subdistrictData.items : [], form.subdistrict);

  useEffect(() => {
    if (!provinceName) return;
    let cancelled = false;
    void fetchAreas(provinceName).then((areas) => {
      if (cancelled) return;
      setDistrictData({ province: provinceName, items: areas?.districts ?? [] });
      if (focusProvinceOnLoad.current === provinceName) { focusProvinceOnLoad.current = null; setMapFocus(focusOn(areas?.province, 9)); }
    });
    return () => { cancelled = true; };
  }, [provinceName]);

  useEffect(() => {
    if (!provinceName || !form.district) return;
    let cancelled = false;
    const key = `${provinceName}|${form.district}`;
    void fetchAreas(provinceName, form.district).then((areas) => {
      if (!cancelled) setSubdistrictData({ key, items: areas?.subdistricts ?? [] });
    });
    return () => { cancelled = true; };
  }, [provinceName, form.district]);

  // Dropdowns only move the map to an approximate center; any previous exact pin is cleared so
  // coordinates never silently disagree with the selected area. Exact lat/lng come from a map click only.
  function selectProvince(provinceId: string) {
    setForm((v) => ({ ...v, province_id: provinceId, district: "", subdistrict: "", lat: null, lng: null }));
    focusProvinceOnLoad.current = provinces.find((province) => province.id === provinceId)?.name_th ?? null;
  }
  function selectDistrict(name: string) {
    setForm((v) => ({ ...v, district: name, subdistrict: "", lat: null, lng: null }));
    setMapFocus(focusOn(districtOptions.find((option) => option.name_th === name), 12));
  }
  function selectSubdistrict(name: string) {
    setForm((v) => ({ ...v, subdistrict: name, lat: null, lng: null }));
    setMapFocus(focusOn(subdistrictOptions.find((option) => option.name_th === name), 13));
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const saved = localStorage.getItem("landmarketthai:sell-draft");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { id: string; token: string };
          const response = await fetch(`/api/property-submissions/${parsed.id}`, { headers: { "x-draft-token": parsed.token } });
          if (response.ok) {
            const body = (await response.json()) as { draft: PropertySubmission };
            if (!cancelled) {
              setDraftId(parsed.id); setToken(parsed.token); setDraft(body.draft); setForm(fromDraft(body.draft)); setLoading(false);
            }
            return;
          }
        } catch { /* create a fresh draft below */ }
      }
      const response = await fetch("/api/property-submissions", { method: "POST" });
      if (!response.ok) throw new Error("ไม่สามารถสร้างแบบร่างได้");
      const created = (await response.json()) as { id: string; token: string };
      localStorage.setItem("landmarketthai:sell-draft", JSON.stringify(created));
      if (!cancelled) { setDraftId(created.id); setToken(created.token); setLoading(false); }
    }
    void init().catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "เริ่มแบบฟอร์มไม่สำเร็จ"); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const totalRai = useMemo(() => {
    if (form.area_rai == null && form.area_ngan == null && form.area_sqwa == null) return null;
    return (form.area_rai ?? 0) + (form.area_ngan ?? 0) / 4 + (form.area_sqwa ?? 0) / 400;
  }, [form.area_rai, form.area_ngan, form.area_sqwa]);
  const derivedPricePerRai = useMemo(() => (
    totalRai != null && totalRai > 0 && form.sale_price != null && form.sale_price > 0
      ? Math.round((form.sale_price / totalRai) * 100) / 100
      : null
  ), [form.sale_price, totalRai]);

  async function saveDraft(): Promise<boolean> {
    if (!draftId || !token) return false;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/property-submissions/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...form, price_per_rai: derivedPricePerRai }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "บันทึกแบบร่างไม่สำเร็จ");
      setDraft(body.draft as PropertySubmission);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกแบบร่างไม่สำเร็จ");
      return false;
    } finally { setSaving(false); }
  }

  function stepError(): string | null {
    if (step === 0 && !form.property_type) return "กรุณาเลือกประเภททรัพย์";
    if (step === 1 && !form.province_id) return "กรุณาเลือกจังหวัด";
    if (step === 2) {
      if (!form.title.trim()) return "กรุณาระบุชื่อทรัพย์";
      if (totalRai == null || totalRai <= 0) return "กรุณาระบุขนาดพื้นที่";
      if (form.sale_price == null || form.sale_price <= 0) return "กรุณาระบุราคาขายที่มากกว่า 0";
    }
    if (step === 4 && (!form.contact_name.trim() || !form.contact_phone.trim())) return "กรุณาระบุชื่อและเบอร์โทรศัพท์";
    return null;
  }

  async function next() {
    const validation = stepError();
    if (validation) { setError(validation); return; }
    if (await saveDraft()) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function upload(file: File, mediaKind: "image" | "document") {
    if (!draftId || !token) return;
    setUploading(true); setError(null);
    try {
      const metadata = { token, media_kind: mediaKind, file_name: file.name, mime_type: file.type, size_bytes: file.size, doc_type: mediaKind === "document" ? "other" : undefined };
      const presign = await fetch(`/api/property-submissions/${draftId}/uploads/presign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(metadata) });
      const signed = await presign.json();
      if (!presign.ok) throw new Error(signed.error || "เตรียมอัปโหลดไม่สำเร็จ");
      const put = await fetch(signed.upload_url, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ");
      const confirm = await fetch(`/api/property-submissions/${draftId}/uploads/confirm`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metadata, storage_key: signed.storage_key, public_url: signed.public_url }),
      });
      const confirmed = await confirm.json();
      if (!confirm.ok) throw new Error(confirmed.error || "ยืนยันไฟล์ไม่สำเร็จ");
      const refreshed = await fetch(`/api/property-submissions/${draftId}`, { headers: { "x-draft-token": token } });
      if (refreshed.ok) setDraft(((await refreshed.json()) as { draft: PropertySubmission }).draft);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "อัปโหลดไฟล์ไม่สำเร็จ"); }
    finally { setUploading(false); }
  }

  async function submit() {
    if (!consent || !draftId || !token) { setError("กรุณายอมรับนโยบายความเป็นส่วนตัว"); return; }
    if (!(await saveDraft())) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/property-submissions/${draftId}/submit`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, consent_pdpa: true, buyer_demand_slug: buyerDemandSlug }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "ส่งข้อมูลไม่สำเร็จ");
      localStorage.removeItem("landmarketthai:sell-draft");
      setSubmitted(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ส่งข้อมูลไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  function numberValue(value: number | null) { return value == null ? "" : String(value); }
  function setNumber(key: keyof DraftForm, raw: string) { setForm((current) => ({ ...current, [key]: raw === "" ? null : Number(raw) })); }

  if (loading) return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">กำลังเปิดแบบร่าง...</div>;
  if (submitted) return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={28} /></div>
      <h2 className="mt-4 text-2xl font-black text-slate-900">ส่งข้อมูลเรียบร้อย</h2>
      <p className="mt-2 text-sm text-slate-600">ทรัพย์ถูกตั้งเป็น Pending Review และจะยังไม่เผยแพร่จนกว่าทีมงานตรวจสอบและอนุมัติ</p>
    </div>
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-7">
        <div className="grid grid-cols-6 gap-1">
          {steps.map((label, index) => (
            <div key={label} className="text-center">
              <div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${index <= step ? "bg-[#00A859] text-white" : "bg-slate-100 text-slate-400"}`}>{index + 1}</div>
              <div className="mt-1 hidden text-[11px] font-semibold text-slate-500 md:block">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-center text-xs font-bold text-slate-600 md:hidden">ขั้นตอน {step + 1}/{steps.length} · {steps[step]}</div>
      </div>

      <div className="p-5 sm:p-8">
        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {step === 0 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">ประเภททรัพย์ที่ต้องการขาย</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {([['land','ที่ดิน'],['factory','โรงงาน'],['warehouse','โกดัง']] as const).map(([value,label]) => (
                <button key={value} type="button" onClick={() => setForm((v) => ({ ...v, property_type: value }))} className={`min-h-20 rounded-2xl border-2 p-4 text-left font-bold ${form.property_type === value ? "border-[#00A859] bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">ตำแหน่งทรัพย์</h2>
            <p className="mt-1 text-sm text-slate-500">ปักหมุดเฉพาะตำแหน่งจริง หากไม่แน่ใจสามารถเว้นพิกัดไว้ให้ทีมงานตรวจสอบได้</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="label">จังหวัด *</span><select className="input" value={form.province_id} onChange={(e) => selectProvince(e.target.value)}><option value="">เลือกจังหวัด</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}</select></label>
              <label><span className="label">{districtLabel}</span><select className="input" value={form.district} disabled={!provinceName} onChange={(e) => selectDistrict(e.target.value)}><option value="">{provinceName ? `เลือก${districtLabel}` : "เลือกจังหวัดก่อน"}</option>{districtOptions.map((d) => <option key={d.name_th} value={d.name_th}>{d.name_th}</option>)}</select></label>
              <label><span className="label">{subdistrictLabel}</span><select className="input" value={form.subdistrict} disabled={!form.district} onChange={(e) => selectSubdistrict(e.target.value)}><option value="">{form.district ? `เลือก${subdistrictLabel}` : `เลือก${districtLabel}ก่อน`}</option>{subdistrictOptions.map((s) => <option key={s.name_th} value={s.name_th}>{s.name_th}</option>)}</select></label>
              <label><span className="label">ที่อยู่ / จุดสังเกต</span><input className="input" value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} /></label>
            </div>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span>การเลือกจังหวัด / {districtLabel} / {subdistrictLabel} จะเลื่อนแผนที่ไปยังบริเวณโดยประมาณเท่านั้น กรุณา<strong>คลิกบนแผนที่</strong>เพื่อปักหมุดตำแหน่งจริงของทรัพย์ (การเปลี่ยนพื้นที่จะล้างหมุดเดิม)</span>
            </div>
            <div className="mt-3"><LocationPicker lat={form.lat} lng={form.lng} focus={mapFocus} onChange={(lat,lng) => setForm((v) => ({ ...v, lat, lng }))} /></div>
            {form.lat != null && form.lng != null
              ? <div className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><MapPin size={13}/>ปักหมุดแล้ว: {form.lat.toFixed(7)}, {form.lng.toFixed(7)}</div>
              : <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13}/>ยังไม่ได้ปักหมุดตำแหน่งจริง</div>}
            <p className="mt-2 text-[11px] text-slate-400">ข้อมูลเขตการปกครอง: <a className="underline" href="https://openadmindata.org/th/" target="_blank" rel="noopener noreferrer">Open Admin Data</a> (CC-BY-4.0)</p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">รายละเอียดและราคา</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="label">ชื่อทรัพย์ *</span><input className="input" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="เช่น ที่ดินอุตสาหกรรม อ.นิคมพัฒนา ระยอง" /></label>
              <label><span className="label">ไร่ *</span><input type="number" min="0" className="input" value={numberValue(form.area_rai)} onChange={(e) => setNumber('area_rai', e.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3"><label><span className="label">งาน</span><input type="number" min="0" max="3" className="input" value={numberValue(form.area_ngan)} onChange={(e) => setNumber('area_ngan', e.target.value)} /></label><label><span className="label">ตร.ว.</span><input type="number" min="0" max="99.99" step="0.1" className="input" value={numberValue(form.area_sqwa)} onChange={(e) => setNumber('area_sqwa', e.target.value)} /></label></div>
              <label><span className="label">ราคาขายรวม *</span><input type="number" min="0" className="input" value={numberValue(form.sale_price)} onChange={(e) => setNumber('sale_price', e.target.value)} /></label>
              <label><span className="label">ราคา / ไร่ (คำนวณอัตโนมัติ)</span><input readOnly className="input bg-slate-50 text-slate-600" value={derivedPricePerRai == null ? "" : derivedPricePerRai.toLocaleString("th-TH", { maximumFractionDigits: 2 })} placeholder="คำนวณจากราคาขายและขนาด" /></label>
              <label><span className="label">ผังเมือง</span><select className="input" value={form.zoning ?? ''} onChange={(e) => setForm((v) => ({ ...v, zoning: (e.target.value || null) as ZoningColor | null }))}><option value="">ไม่ระบุ</option><option value="purple">ม่วง</option><option value="purple_light">ม่วงอ่อน</option><option value="brown">น้ำตาล</option><option value="orange">ส้ม</option><option value="yellow">เหลือง</option><option value="green">เขียว</option><option value="other">อื่นๆ</option></select></label>
              <label><span className="label">หน้ากว้าง (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.frontage_m)} onChange={(e) => setNumber('frontage_m', e.target.value)} /></label>
              <label><span className="label">ความลึกต่ำสุด (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.depth_min_m)} onChange={(e) => setNumber('depth_min_m', e.target.value)} /></label>
              <label><span className="label">ความลึกสูงสุด (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.depth_max_m)} onChange={(e) => setNumber('depth_max_m', e.target.value)} /></label>
              <label><span className="label">ชื่อถนน</span><input className="input" value={form.road_name} onChange={(e) => setForm((v) => ({ ...v, road_name: e.target.value }))} /></label>
              <label><span className="label">ความกว้างถนน (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.road_width_m)} onChange={(e) => setNumber('road_width_m', e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">รายละเอียดเพิ่มเติม</span><textarea className="input min-h-28" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} /></label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">รูปและเอกสาร</h2>
            <p className="mt-1 text-sm text-slate-500">รองรับ JPG, PNG, WebP และ PDF สูงสุด 20MB ต่อไฟล์ เอกสารจะเก็บเป็น Private</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-[#00A859]"><ImagePlus className="text-[#00A859]"/><span className="mt-2 text-sm font-bold">เพิ่มรูปทรัพย์</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading} onChange={(e) => Array.from(e.target.files ?? []).forEach((file) => void upload(file,'image'))}/></label>
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-brand-500"><FileText className="text-brand-600"/><span className="mt-2 text-sm font-bold">เพิ่มเอกสาร</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" disabled={uploading} onChange={(e) => Array.from(e.target.files ?? []).forEach((file) => void upload(file,'document'))}/></label>
            </div>
            {uploading && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><UploadCloud size={16}/>กำลังอัปโหลด...</div>}
            {draft?.media && draft.media.length > 0 && <div className="mt-5 divide-y rounded-2xl border border-slate-200">{draft.media.map((media) => <div key={media.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="truncate">{media.file_name}</span><span className="shrink-0 text-xs text-slate-400">{media.media_kind === 'image' ? 'รูป' : 'เอกสาร'}</span></div>)}</div>}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">ข้อมูลติดต่อ</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="label">ชื่อ – นามสกุล *</span><input className="input" value={form.contact_name} onChange={(e) => setForm((v) => ({ ...v, contact_name: e.target.value }))}/></label>
              <label><span className="label">เบอร์โทรศัพท์ *</span><input className="input" inputMode="tel" value={form.contact_phone} onChange={(e) => setForm((v) => ({ ...v, contact_phone: e.target.value }))}/></label>
              <label className="sm:col-span-2"><span className="label">LINE ID</span><input className="input" value={form.contact_line} onChange={(e) => setForm((v) => ({ ...v, contact_line: e.target.value }))}/></label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-xl font-black text-slate-900">ตรวจสอบและส่ง</h2>
            <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
              <div><span className="text-slate-400">ประเภท</span><div className="font-bold">{form.property_type === 'factory' ? 'โรงงาน' : form.property_type === 'warehouse' ? 'โกดัง' : 'ที่ดิน'} · ขาย</div></div>
              <div><span className="text-slate-400">ชื่อทรัพย์</span><div className="font-bold">{form.title || '-'}</div></div>
              <div><span className="text-slate-400">ขนาด</span><div className="font-bold">{totalRai != null ? `${totalRai.toLocaleString('th-TH',{maximumFractionDigits:5})} ไร่` : '-'}</div></div>
              <div className="min-w-0"><span className="text-slate-400">ผู้ติดต่อ</span><div className="break-words font-bold">{form.contact_name} · {form.contact_phone}</div></div>
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)}/><span>ยินยอมให้ LandmarketThai เก็บและใช้ข้อมูลที่ส่งเพื่อการตรวจสอบทรัพย์และติดต่อกลับตามนโยบายความเป็นส่วนตัว</span></label>
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">ข้อมูลจะเข้าสถานะ Pending Review และไม่เผยแพร่อัตโนมัติ</div>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <button type="button" onClick={() => setStep((current) => Math.max(0,current-1))} disabled={step===0 || saving} className="btn-outline disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={17}/>ย้อนกลับ</button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void saveDraft()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-bold text-slate-500"><Save size={16}/>{saving ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}</button>
          {step < steps.length - 1 ? <button type="button" onClick={() => void next()} disabled={saving} className="btn-green">ถัดไป <ChevronRight size={17}/></button> : <button type="button" onClick={() => void submit()} disabled={saving || !consent} className="btn-green disabled:cursor-not-allowed disabled:opacity-50">ส่งให้ทีมงานตรวจสอบ <Check size={17}/></button>}
        </div>
      </div>
    </div>
  );
}
