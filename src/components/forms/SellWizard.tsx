"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, FileText, ImagePlus, Link2, MapPin, Save, UploadCloud } from "lucide-react";
import type { PropertySubmission, Province, PropertyType, TransactionType, ZoningColor } from "@/lib/types/database";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/marketplace/presentation";
import { draftPatch, loadSellerDraft, mergeDraft, phoneLooksValid, reconcileZoning } from "@/lib/seller-draft";
import { TurnstileWidget, useTurnstile } from "@/components/security/TurnstileWidget";
import LocationPicker, { type MapFocus } from "./LocationPicker";
import ZoningFields from "./ZoningFields";
import { getZoning, zoningSchema, type ZoningInfo } from "@/lib/zoning";

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
  usable_area_sqm: number | null;
  frontage_m: number | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  road_name: string;
  road_width_m: number | null;
  zoning: ZoningColor | null;
  zoning_info: ZoningInfo;
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
  usable_area_sqm: null,
  frontage_m: null,
  depth_min_m: null,
  depth_max_m: null,
  road_name: "",
  road_width_m: null,
  zoning: null,
  zoning_info: zoningSchema.parse({}),
  sale_price: null,
  price_per_rai: null,
  description: "",
  contact_name: "",
  contact_phone: "",
  contact_line: "",
};

// Section headings only — the whole form is one page with a single submit button.
const SECTIONS = {
  type: "ประเภททรัพย์",
  location: "ตำแหน่ง",
  details: "รายละเอียดและราคา",
  media: "รูปและเอกสาร",
  contact: "ข้อมูลติดต่อ",
  review: "ตรวจสอบและส่ง",
} as const;
type SectionId = keyof typeof SECTIONS;

type FieldKey = "property_type" | "province_id" | "title" | "area" | "sale_price" | "contact_name" | "contact_phone" | "consent";
const FIELD_SECTION: Record<FieldKey, SectionId> = {
  property_type: "type", province_id: "location", title: "details", area: "details", sale_price: "details",
  contact_name: "contact", contact_phone: "contact", consent: "review",
};

/** Thai labels for server-side draft validation errors (PATCH issues.fieldErrors). */
const SERVER_FIELD_LABELS: Record<string, string> = {
  area_rai: "ไร่ (จำนวนเต็ม)", area_ngan: "งาน (0–3)", area_sqwa: "ตร.ว. (น้อยกว่า 100)", usable_area_sqm: "พื้นที่ใช้สอย",
  sale_price: "ราคาขาย", title: "ชื่อทรัพย์", contact_phone: "เบอร์โทรศัพท์", lat: "พิกัด", lng: "พิกัด",
};

// The marketplace is industrial land first; every other type stays one select away.
const PRIMARY_TYPES: PropertyType[] = ["land", "factory", "warehouse"];

const AUTOSAVE_DELAY_MS = 1500;
const DRAFT_STORAGE_KEY = "landmarketthai:sell-draft";

const localFormKey = (id: string) => `${DRAFT_STORAGE_KEY}:${id}:form`;

function fromDraft(draft: PropertySubmission): DraftForm {
  return reconcileZoning({
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
    usable_area_sqm: draft.usable_area_sqm,
    frontage_m: draft.frontage_m,
    depth_min_m: draft.depth_min_m,
    depth_max_m: draft.depth_max_m,
    road_name: draft.road_name ?? "",
    road_width_m: draft.road_width_m,
    zoning: draft.zoning,
    zoning_info: getZoning(draft),
    sale_price: draft.sale_price,
    price_per_rai: draft.price_per_rai,
    description: draft.description ?? "",
    contact_name: draft.contact_name ?? "",
    contact_phone: draft.contact_phone ?? "",
    contact_line: draft.contact_line ?? "",
  });
}

type SaveState = "unsaved" | "saving" | "saved" | "error";
type MapsStatus = { state: "idle" | "loading" | "error"; message?: string } | { state: "ok"; lat: number; lng: number };

export default function SellWizard({ provinces, buyerDemandSlug }: Props) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState<PropertySubmission | null>(null);
  const [form, setFormState] = useState<DraftForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveRetryable, setSaveRetryable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const turnstile = useTurnstile();
  const [uploadBatchCount, setUploadBatchCount] = useState(0);
  const uploading = uploadBatchCount > 0;
  const uploadBatches = useRef(new Set<Promise<boolean>>());
  const failedUploads = useRef(new Map<File, "image" | "document">());
  const frozen = useRef(false);
  const mapsRequest = useRef(0);
  const formRef = useRef(form);
  const savedForm = useRef(JSON.stringify(emptyForm));
  const storageId = useRef<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [initFailed, setInitFailed] = useState(false);
  const credentials = useRef<{ id: string; token: string } | null>(null);
  const creating = useRef<Promise<{ id: string; token: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [districtData, setDistrictData] = useState<{ province: string; items: AreaOption[] }>({ province: "", items: [] });
  const [subdistrictData, setSubdistrictData] = useState<{ key: string; items: AreaOption[] }>({ key: "", items: [] });
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [mapsInput, setMapsInput] = useState("");
  const [mapsStatus, setMapsStatus] = useState<MapsStatus>({ state: "idle" });
  const focusProvinceOnLoad = useRef<string | null>(null);
  const savedPayload = useRef<string | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));

  function setForm(update: (current: DraftForm) => DraftForm) {
    if (frozen.current) return;
    const next = update(formRef.current);
    formRef.current = next;
    setFormState(next);
    setSaveState((current) => current === "saving" ? current : "unsaved");
    if (storageId.current) {
      try { localStorage.setItem(localFormKey(storageId.current), JSON.stringify(next)); }
      catch { setError("เก็บข้อมูลในเครื่องไม่สำเร็จ กรุณาบันทึกแบบร่างก่อนปิดหน้านี้"); }
    }
  }

  function cancelMapsLookup() {
    mapsRequest.current++;
    setMapsStatus({ state: "idle" });
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(formRef.current) !== savedForm.current || uploadBatches.current.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

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

  function clearFieldError(...keys: FieldKey[]) {
    setFieldErrors((current) => keys.some((key) => current[key])
      ? Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key as FieldKey))) as Partial<Record<FieldKey, string>>
      : current);
  }

  // Dropdowns only move the map to an approximate center; any previous exact pin is cleared so
  // coordinates never silently disagree with the selected area. Exact lat/lng come from a map click
  // or a pasted Google Maps link only.
  function selectProvince(provinceId: string) {
    setForm((v) => ({ ...v, province_id: provinceId, district: "", subdistrict: "", lat: null, lng: null }));
    cancelMapsLookup();
    focusProvinceOnLoad.current = provinces.find((province) => province.id === provinceId)?.name_th ?? null;
    clearFieldError("province_id");
  }
  function selectDistrict(name: string) {
    setForm((v) => ({ ...v, district: name, subdistrict: "", lat: null, lng: null }));
    cancelMapsLookup();
    setMapFocus(focusOn(districtOptions.find((option) => option.name_th === name), 12));
  }
  function selectSubdistrict(name: string) {
    setForm((v) => ({ ...v, subdistrict: name, lat: null, lng: null }));
    cancelMapsLookup();
    setMapFocus(focusOn(subdistrictOptions.find((option) => option.name_th === name), 13));
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true); setError(null);
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      let parsed: { id: string; token: string } | null = null;
      if (saved) {
        try {
          const credentials = JSON.parse(saved) as Partial<{ id: string; token: string }>;
          if (typeof credentials.id === "string" && credentials.id && typeof credentials.token === "string" && credentials.token) parsed = credentials as { id: string; token: string };
        } catch { /* Corrupt storage is stale; network errors below must keep valid credentials. */ }
      }
      if (saved && parsed) {
        const restored = await loadSellerDraft(parsed.id, parsed.token);
        if (cancelled) return;
        if (restored) {
          setDraft(restored);
          if (restored.status !== "draft") {
            setSubmitted(true); setLoading(false); frozen.current = true;
            return;
          }
          const baseline = fromDraft(restored);
          let local: Partial<DraftForm> = {};
          try { local = JSON.parse(localStorage.getItem(localFormKey(parsed.id)) ?? "{}") ?? {}; }
          catch { setError("อ่านข้อมูลที่ยังไม่บันทึกในเครื่องไม่สำเร็จ"); }
          // Pre-structured local edits carry only a legacy color: keep the seller's newer choice and mirror it into zoning_info.
          if (local.zoning_info === undefined && local.zoning !== undefined && local.zoning !== baseline.zoning) local.zoning_info = { ...baseline.zoning_info, zones: local.zoning ? [{ color: local.zoning, type_code: "", type_name: "" }] : [] };
          const next = { ...baseline, ...local };
          storageId.current = parsed.id;
          formRef.current = next;
          savedForm.current = JSON.stringify(baseline);
          savedPayload.current = null;
          setDraftId(parsed.id); setToken(parsed.token); setFormState(next);
          setSaveState(JSON.stringify(next) === savedForm.current ? "saved" : "unsaved"); setLoading(false);
          return;
        }
        // Definitively gone (404): drop the dead credentials so a later first edit starts a fresh draft.
        localStorage.removeItem(DRAFT_STORAGE_KEY); localStorage.removeItem(localFormKey(parsed.id));
      } else if (saved) {
        const id = saved.match(/"id"\s*:\s*"([^"]+)"/)?.[1];
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        if (id) localStorage.removeItem(localFormKey(id));
      }
      // Viewing the page never creates a draft; ensureDraft() does that on the first intentional edit, save, upload or submit.
      storageId.current = null;
      savedForm.current = JSON.stringify(emptyForm);
      savedPayload.current = null;
      formRef.current = emptyForm;
      setFormState(emptyForm); setLoading(false);
    }
    setInitFailed(false);
    void init().catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "เริ่มแบบฟอร์มไม่สำเร็จ"); setInitFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [restoreAttempt]);

  const totalRai = useMemo(() => {
    if (form.area_rai == null && form.area_ngan == null && form.area_sqwa == null) return null;
    return (form.area_rai ?? 0) + (form.area_ngan ?? 0) / 4 + (form.area_sqwa ?? 0) / 400;
  }, [form.area_rai, form.area_ngan, form.area_sqwa]);
  // Price per rai only exists when there is land area; building-only assets leave it empty.
  const derivedPricePerRai = useMemo(() => (
    totalRai != null && totalRai > 0 && form.sale_price != null && form.sale_price > 0
      ? Math.round((form.sale_price / totalRai) * 100) / 100
      : null
  ), [form.sale_price, totalRai]);
  const hasArea = (totalRai != null && totalRai > 0) || (form.usable_area_sqm != null && form.usable_area_sqm > 0);

  // A half-typed phone number would fail server validation on every autosave; keep it local until valid.
  const payload = useMemo(() => draftPatch(form, derivedPricePerRai), [form, derivedPricePerRai]);
  const formSnapshot = JSON.stringify(form);

  /** Creates the draft once, on first intentional use; concurrent callers share one POST and a failed create can be retried. */
  function ensureDraft(): Promise<{ id: string; token: string }> {
    const existing = credentials.current ?? (draftId && token ? { id: draftId, token } : null);
    if (existing) return Promise.resolve(existing);
    creating.current ??= (async () => {
      const response = await fetch("/api/property-submissions", { method: "POST" });
      if (!response.ok) throw new Error("ไม่สามารถสร้างแบบร่างได้ ข้อมูลที่กรอกยังอยู่ในหน้านี้");
      const created = (await response.json()) as { id: string; token: string };
      if (!created?.id || !created.token) throw new Error("ไม่สามารถสร้างแบบร่างได้ ข้อมูลที่กรอกยังอยู่ในหน้านี้");
      credentials.current = created;
      storageId.current = created.id;
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(created));
        localStorage.setItem(localFormKey(created.id), JSON.stringify(formRef.current));
      } catch { setError("เก็บข้อมูลในเครื่องไม่สำเร็จ กรุณาบันทึกแบบร่างก่อนปิดหน้านี้"); }
      setDraftId(created.id); setToken(created.token);
      return created;
    })().finally(() => { creating.current = null; });
    return creating.current;
  }

  async function persist(body: string, snapshot: string): Promise<boolean> {
    let retryable = true;
    setSaveState("saving"); setSaveError(null);
    try {
      const target = draftId && token ? { id: draftId, token } : await ensureDraft();
      const response = await fetch(`/api/property-submissions/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: target.token, ...JSON.parse(body) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        retryable = response.status >= 500 || response.status === 429;
        const fields = Object.keys(result?.issues?.fieldErrors ?? {}).map((key) => SERVER_FIELD_LABELS[key] ?? key);
        throw new Error(fields.length ? `บันทึกไม่สำเร็จ กรุณาตรวจสอบ: ${[...new Set(fields)].join(", ")}` : result.error || "บันทึกแบบร่างไม่สำเร็จ");
      }
      savedPayload.current = body;
      if (result.draft) setDraft((current) => mergeDraft(current, result.draft as PropertySubmission));
      const sent = JSON.parse(snapshot) as DraftForm;
      if (sent.contact_phone.trim() === "" || phoneLooksValid(sent.contact_phone)) savedForm.current = snapshot;
      setSaveState(JSON.stringify(formRef.current) === savedForm.current ? "saved" : "unsaved");
      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "บันทึกแบบร่างไม่สำเร็จ");
      setSaveRetryable(retryable);
      setSaveState("error");
      return false;
    }
  }

  /** Saves the current form; saves run one at a time so an older PATCH never lands after a newer one. */
  function saveDraft(force = false): Promise<boolean> {
    if (frozen.current && !force) return Promise.resolve(false);
    const body = payload;
    const snapshot = formSnapshot;
    const run = saveQueue.current.then(() => !force && body === savedPayload.current ? true : persist(body, snapshot));
    saveQueue.current = run.catch(() => false);
    return run;
  }
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => { saveDraftRef.current = saveDraft; });

  // No draft exists until the seller edits something; the first edit creates it, then normal autosave takes over.
  useEffect(() => {
    if (loading || submitting || submitted || draftId || initFailed || saveState === "error" || formSnapshot === savedForm.current) return;
    const timer = setTimeout(() => void saveDraftRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [formSnapshot, loading, submitting, submitted, draftId, initFailed, saveState]);

  // Restored local edits are dirty. Re-check after saves so reverting an in-flight edit is saved too.
  useEffect(() => {
    if (loading || submitting || submitted || !draftId || !token) return;
    if (savedPayload.current === null && formSnapshot === savedForm.current) { savedPayload.current = payload; return; }
    if (payload === savedPayload.current || saveState === "error") return;
    const timer = setTimeout(() => void saveDraftRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [payload, formSnapshot, loading, submitting, submitted, draftId, token, saveState]);

  useEffect(() => {
    if (saveState !== "error" || !saveRetryable || submitting || submitted) return;
    const retry = () => void saveDraftRef.current();
    const timer = setTimeout(retry, 5000);
    window.addEventListener("online", retry);
    return () => { clearTimeout(timer); window.removeEventListener("online", retry); };
  }, [saveState, saveRetryable, submitting, submitted, payload]);

  async function resolveMapsLink() {
    if (frozen.current) return;
    const request = ++mapsRequest.current;
    if (!mapsInput.trim()) { setMapsStatus({ state: "error", message: "กรุณาวางลิงก์ Google Maps หรือพิกัด" }); return; }
    setMapsStatus({ state: "loading" });
    try {
      const response = await fetch("/api/maps-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: mapsInput }) });
      const body = await response.json().catch(() => ({}));
      if (request !== mapsRequest.current || frozen.current) return;
      if (!response.ok || typeof body.lat !== "number" || typeof body.lng !== "number") throw new Error(body.error || "อ่านพิกัดจากลิงก์ไม่สำเร็จ");
      const { lat, lng } = body as { lat: number; lng: number };
      setForm((v) => ({ ...v, lat, lng }));
      setMapFocus((current) => ({ lat, lng, zoom: 17, key: (current?.key ?? 0) + 1 }));
      setMapsStatus({ state: "ok", lat, lng });
    } catch (reason) {
      if (request !== mapsRequest.current || frozen.current) return;
      setMapsStatus({ state: "error", message: reason instanceof Error ? reason.message : "อ่านพิกัดจากลิงก์ไม่สำเร็จ" });
    }
  }

  async function upload(file: File, mediaKind: "image" | "document", target: { id: string; token: string }) {
    try {
      const { id: draftId, token } = target;
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
      failedUploads.current.delete(file);
      return true;
    } catch (reason) { failedUploads.current.set(file, mediaKind); setError(reason instanceof Error ? reason.message : "อัปโหลดไฟล์ไม่สำเร็จ"); return false; }
  }

  function uploadBatch(files: File[], mediaKind: "image" | "document") {
    if (frozen.current || !files.length) return;
    setError(null); setUploadBatchCount((count) => count + 1);
    const batch = (async () => {
      let target: { id: string; token: string };
      try { target = draftId && token ? { id: draftId, token } : await ensureDraft(); }
      catch (reason) {
        for (const file of files) failedUploads.current.set(file, mediaKind);
        setError(reason instanceof Error ? reason.message : "สร้างแบบร่างไม่สำเร็จ");
        return false;
      }
      const results = await Promise.all(files.map((file) => upload(file, mediaKind, target)));
      try {
        const refreshed = await loadSellerDraft(target.id, target.token);
        if (!refreshed) throw new Error("เปิดแบบร่างหลังอัปโหลดไม่สำเร็จ");
        setDraft((current) => ({ ...mergeDraft(current, refreshed), media: [...new Map([...(current?.media ?? []), ...(refreshed.media ?? [])].map((media) => [media.id, media])).values()] }));
        return results.every(Boolean);
      } catch {
        setError("โหลดรายการไฟล์ไม่สำเร็จ ไฟล์ที่ยืนยันแล้วถูกเก็บไว้ในแบบร่าง");
        return results.every(Boolean);
      }
    })();
    uploadBatches.current.add(batch);
    void batch.finally(() => { uploadBatches.current.delete(batch); setUploadBatchCount((count) => count - 1); });
  }

  function validate(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!form.property_type) errors.property_type = "กรุณาเลือกประเภททรัพย์";
    if (!form.province_id) errors.province_id = "กรุณาเลือกจังหวัด";
    if (!form.title.trim()) errors.title = "กรุณาระบุชื่อทรัพย์";
    if (!hasArea) errors.area = "กรุณาระบุขนาดที่ดิน (ไร่/งาน/ตร.ว.) หรือพื้นที่ใช้สอย (ตร.ม.) อย่างน้อยหนึ่งอย่าง";
    if (form.sale_price == null || form.sale_price <= 0) errors.sale_price = "กรุณาระบุราคาขายที่มากกว่า 0";
    if (!form.contact_name.trim()) errors.contact_name = "กรุณาระบุชื่อผู้ติดต่อ";
    if (!phoneLooksValid(form.contact_phone)) errors.contact_phone = "กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้อง เช่น 0812345678";
    if (!consent) errors.consent = "กรุณายอมรับนโยบายความเป็นส่วนตัว";
    return errors;
  }

  async function submit() {
    if (frozen.current) return;
    const errors = validate();
    setFieldErrors(errors);
    const first = (Object.keys(errors) as FieldKey[])[0];
    if (first) {
      setError(null);
      document.getElementById(`sell-${FIELD_SECTION[first]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sell-field="${first}"]`)?.focus());
      return;
    }
    frozen.current = true;
    cancelMapsLookup();
    setSubmitting(true); setError(null);
    try {
      const uploads = await Promise.all([...uploadBatches.current]);
      if (failedUploads.current.size > 0 || uploads.some((ok) => !ok)) throw new Error("มีไฟล์อัปโหลดไม่สำเร็จ กรุณาตรวจสอบแล้วลองอีกครั้ง");
      await saveQueue.current;
      if (!(await saveDraft(true))) throw new Error("บันทึกข้อมูลล่าสุดไม่สำเร็จ กรุณาตรวจสอบแล้วลองอีกครั้ง");
      const target = draftId && token ? { id: draftId, token } : await ensureDraft();
      // Turnstile tokens are single-use: reset after every attempt, including a network failure after the server may have consumed it.
      const response = await fetch(`/api/property-submissions/${target.id}/submit`, {
        method: "POST", headers: { "content-type": "application/json", ...turnstile.headers() }, body: JSON.stringify({ token: target.token, consent_pdpa: true, buyer_demand_slug: buyerDemandSlug }),
      }).finally(() => turnstile.reset());
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "ส่งข้อมูลไม่สำเร็จ");
      setSubmitted(true);
      try { localStorage.removeItem(DRAFT_STORAGE_KEY); localStorage.removeItem(localFormKey(target.id)); }
      catch { /* A later restore checks status and keeps this submission closed. */ }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ส่งข้อมูลไม่สำเร็จ"); }
    finally { frozen.current = false; setSubmitting(false); }
  }

  function setText(key: "title" | "address" | "road_name" | "description" | "contact_name" | "contact_phone" | "contact_line", value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "title" || key === "contact_name" || key === "contact_phone") clearFieldError(key);
  }
  function numberValue(value: number | null) { return value == null ? "" : String(value); }
  function setNumber(key: keyof DraftForm, raw: string) {
    setForm((current) => ({ ...current, [key]: raw === "" ? null : Number(raw) }));
    if (key === "sale_price") clearFieldError("sale_price");
    if (key === "area_rai" || key === "area_ngan" || key === "area_sqwa" || key === "usable_area_sqm") clearFieldError("area");
  }
  const invalid = (key: FieldKey) => ({ "data-sell-field": key, ...(fieldErrors[key] ? { "aria-invalid": true as const, "aria-describedby": `sell-error-${key}` } : {}) });
  const fieldError = (key: FieldKey) => fieldErrors[key] && <p id={`sell-error-${key}`} className="mt-1 text-xs font-semibold text-red-600">{fieldErrors[key]}</p>;
  const heading = (id: SectionId, hint?: string) => (
    <div className="mb-4">
      <h2 className="text-lg font-black text-slate-900">{SECTIONS[id]}</h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );

  if (loading) return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">กำลังเปิดแบบร่าง...</div>;
  if (initFailed) return <div role="alert" className="rounded-3xl border border-red-200 bg-white p-8"><p>{error}</p><button type="button" className="btn-green mt-4" onClick={() => setRestoreAttempt((attempt) => attempt + 1)}>ลองเปิดแบบร่างอีกครั้ง</button></div>;
  if (submitted) return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={28} /></div>
      <h2 className="mt-4 text-2xl font-black text-slate-900">{draft && draft.status !== "draft" ? "แบบร่างนี้ปิดรับการแก้ไขแล้ว" : "ส่งข้อมูลเรียบร้อย"}</h2>
      <p className="mt-2 text-sm text-slate-600">{draft && draft.status !== "draft" ? `สถานะ: ${draft.status}` : "ทรัพย์ถูกตั้งเป็น Pending Review และจะยังไม่เผยแพร่จนกว่าทีมงานตรวจสอบและอนุมัติ"}</p>
    </div>
  );

  const errorCount = Object.keys(fieldErrors).length;
  const pinFromLink = mapsStatus.state === "ok" && form.lat === mapsStatus.lat && form.lng === mapsStatus.lng;
  const saveLabel = saveState === "saving" ? "กำลังบันทึก..." : saveState === "error" ? (saveRetryable ? "บันทึกไม่สำเร็จ — จะลองใหม่" : "บันทึกไม่สำเร็จ — กรุณาตรวจสอบข้อมูล") : formSnapshot === savedForm.current ? (draftId ? "บันทึกแล้ว" : "แบบร่างจะถูกสร้างเมื่อเริ่มกรอก") : "ยังไม่ได้บันทึก";

  return (
    <div className="-mx-4 border-b border-slate-200 bg-white sm:mx-0 sm:rounded-3xl sm:border sm:shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-8">
        <span className="text-sm font-bold text-slate-700">ฝากขายทรัพย์ · กรอกได้ในหน้าเดียว</span>
        <span role="status" aria-live="polite" className={`text-xs font-semibold ${saveState === "error" ? "text-red-600" : "text-slate-500"}`}>
          {saveLabel ?? "บันทึกแบบร่างอัตโนมัติ"}
        </span>
      </div>

      <fieldset disabled={submitting} className="min-w-0 divide-y divide-slate-100">
        {error && <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8">{error}</div>}

        <section id="sell-type" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("type")}
          <div role="radiogroup" aria-label="ประเภททรัพย์" className="grid gap-2 sm:grid-cols-4">
            {PRIMARY_TYPES.map((value) => (
              <label
                key={value}
                className={`flex min-h-12 items-center rounded-xl border px-3 py-2 text-sm font-bold transition ${form.property_type === value ? "border-[#071d4a] bg-brand-50 text-[#071d4a] ring-1 ring-[#071d4a]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}
              >
                <input type="radio" name="property_type" value={value} checked={form.property_type === value} {...invalid("property_type")} className="mr-2 accent-[#071d4a]" onChange={() => { setForm((v) => ({ ...v, property_type: value })); clearFieldError("property_type"); }} />
                {PROPERTY_TYPE_LABELS[value]}
              </label>
            ))}
            <select
              aria-label="ประเภทอื่น"
              className={`input min-h-12 font-bold ${form.property_type && !PRIMARY_TYPES.includes(form.property_type) ? "border-[#071d4a] ring-1 ring-[#071d4a]" : ""}`}
              value={form.property_type && !PRIMARY_TYPES.includes(form.property_type) ? form.property_type : ""}
              onChange={(e) => { const value = e.target.value as PropertyType; if (!value) return; setForm((v) => ({ ...v, property_type: value })); clearFieldError("property_type"); }}
            >
              <option value="">ประเภทอื่น…</option>
              {PROPERTY_TYPES.filter((value) => !PRIMARY_TYPES.includes(value)).map((value) => <option key={value} value={value}>{PROPERTY_TYPE_LABELS[value]}</option>)}
            </select>
          </div>
          {fieldError("property_type")}
        </section>

        <section id="sell-location" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("location","ปักหมุดไม่บังคับ แต่ช่วยให้ผู้ซื้อตัดสินใจได้เร็วขึ้น")}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="label">จังหวัด *</span><select className="input" {...invalid("province_id")} value={form.province_id} onChange={(e) => selectProvince(e.target.value)}><option value="">เลือกจังหวัด</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}</select>{fieldError("province_id")}</label>
            <label><span className="label">{districtLabel}</span><select className="input" value={form.district} disabled={!provinceName} onChange={(e) => selectDistrict(e.target.value)}><option value="">{provinceName ? `เลือก${districtLabel}` : "เลือกจังหวัดก่อน"}</option>{districtOptions.map((d) => <option key={d.name_th} value={d.name_th}>{d.name_th}</option>)}</select></label>
            <label><span className="label">{subdistrictLabel}</span><select className="input" value={form.subdistrict} disabled={!form.district} onChange={(e) => selectSubdistrict(e.target.value)}><option value="">{form.district ? `เลือก${subdistrictLabel}` : `เลือก${districtLabel}ก่อน`}</option>{subdistrictOptions.map((s) => <option key={s.name_th} value={s.name_th}>{s.name_th}</option>)}</select></label>
            <label><span className="label">ที่อยู่ / จุดสังเกต</span><input className="input" maxLength={500} value={form.address} onChange={(e) => setText("address", e.target.value)} /></label>
          </div>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <label htmlFor="sell-maps-link" className="flex items-center gap-2 text-sm font-bold text-slate-800"><Link2 size={16} className="text-blue-700" />วางลิงก์ Google Maps หรือพิกัด</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="sell-maps-link"
                className="input flex-1"
                inputMode="url"
                maxLength={2048}
                value={mapsInput}
                placeholder="เช่น https://maps.app.goo.gl/... หรือ 13.0827, 101.0145"
                onChange={(e) => { setMapsInput(e.target.value); cancelMapsLookup(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void resolveMapsLink(); } }}
              />
              <button type="button" onClick={() => void resolveMapsLink()} disabled={mapsStatus.state === "loading"} className="btn-green justify-center disabled:opacity-60">
                <MapPin size={16} />{mapsStatus.state === "loading" ? "กำลังอ่านพิกัด..." : "ปักหมุดจากลิงก์"}
              </button>
            </div>
            {mapsStatus.state === "error" && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{mapsStatus.message}</p>}
            {pinFromLink && <p role="status" className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} />ปักหมุดตามลิงก์แล้ว (พิกัดจริง) — คลิกบนแผนที่เพื่อปรับตำแหน่งได้</p>}
            {!pinFromLink && <p className="mt-2 text-xs text-slate-500">ใน Google Maps กด “แชร์” แล้วคัดลอกลิงก์ หรือคลิกบนแผนที่ด้านล่าง (การเลือกจังหวัด/{districtLabel}/{subdistrictLabel}จะล้างหมุดเดิม)</p>}
          </div>

          <div className="mt-3"><LocationPicker lat={form.lat} lng={form.lng} focus={mapFocus} disabled={submitting} onChange={(lat,lng) => { if (frozen.current) return; cancelMapsLookup(); setForm((v) => ({ ...v, lat, lng })); }} /></div>
          {form.lat != null && form.lng != null
            ? <div className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><MapPin size={13}/>ปักหมุดแล้ว: {form.lat.toFixed(7)}, {form.lng.toFixed(7)}</div>
            : <div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13}/>ยังไม่ได้ปักหมุดตำแหน่งจริง (ไม่บังคับ)</div>}
          <p className="mt-2 text-[11px] text-slate-400">ข้อมูลเขตการปกครอง: <a className="underline" href="https://openadmindata.org/th/" target="_blank" rel="noopener noreferrer">Open Admin Data</a> (CC-BY-4.0)</p>
        </section>

        <section id="sell-details" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("details")}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">ชื่อทรัพย์ *</span><input className="input" {...invalid("title")} maxLength={180} value={form.title} onChange={(e) => setText("title", e.target.value)} placeholder="เช่น ที่ดินอุตสาหกรรม อ.นิคมพัฒนา ระยอง" />{fieldError("title")}</label>
            <div className="sm:col-span-2">
              <span className="label">ขนาดพื้นที่ *</span>
              <p className="mb-2 text-xs text-slate-500">กรอกช่องที่ตรงกับทรัพย์อย่างน้อยหนึ่งแบบ: ที่ดินใช้ ไร่/งาน/ตร.ว. ส่วนบ้าน คอนโด อาคาร ใช้พื้นที่ใช้สอย (ตร.ม.) หรือกรอกทั้งสองแบบก็ได้</p>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <fieldset className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-500">ขนาดที่ดิน</legend>
                  <label><span className="text-xs text-slate-500">ไร่</span><input type="number" min="0" step="1" inputMode="numeric" className="input" {...invalid("area")} value={numberValue(form.area_rai)} onChange={(e) => setNumber("area_rai", e.target.value)} /></label>
                  <label><span className="text-xs text-slate-500">งาน</span><input type="number" min="0" max="3" step="1" inputMode="numeric" className="input" value={numberValue(form.area_ngan)} onChange={(e) => setNumber("area_ngan", e.target.value)} /></label>
                  <label><span className="text-xs text-slate-500">ตร.ว.</span><input type="number" min="0" max="99.99" step="0.1" inputMode="decimal" className="input" value={numberValue(form.area_sqwa)} onChange={(e) => setNumber("area_sqwa", e.target.value)} /></label>
                </fieldset>
                <fieldset className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-500">พื้นที่ใช้สอย</legend>
                  <label><span className="text-xs text-slate-500">ตร.ม.</span><input type="number" min="0" step="any" inputMode="decimal" className="input" value={numberValue(form.usable_area_sqm)} onChange={(e) => setNumber("usable_area_sqm", e.target.value)} /></label>
                </fieldset>
              </div>
              {fieldError("area")}
            </div>
            <label><span className="label">ราคาขายรวม (บาท) *</span><input type="number" min="0" inputMode="numeric" className="input" {...invalid("sale_price")} value={numberValue(form.sale_price)} onChange={(e) => setNumber("sale_price", e.target.value)} />{fieldError("sale_price")}</label>
            <label><span className="label">ราคา / ไร่ (คำนวณอัตโนมัติ)</span><input readOnly className="input bg-slate-50 text-slate-600" value={derivedPricePerRai == null ? "" : derivedPricePerRai.toLocaleString("th-TH", { maximumFractionDigits: 2 })} placeholder="คำนวณเมื่อมีขนาดที่ดิน (ไร่)" /></label>
            <div className="sm:col-span-2"><ZoningFields value={form.zoning_info} onChange={zoning_info => setForm(value => ({ ...value, zoning_info, zoning: zoning_info.zones.find(zone => zone.color)?.color ?? null }))} /></div>
            <label><span className="label">หน้ากว้าง (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.frontage_m)} onChange={(e) => setNumber("frontage_m", e.target.value)} /></label>
          </div>
          <details className="group mt-4 rounded-xl border border-slate-200">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">รายละเอียดเพิ่มเติม (ไม่บังคับ)<span className="transition-transform group-open:rotate-180">▾</span></summary>
            <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
              <label><span className="label">ความลึกต่ำสุด (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.depth_min_m)} onChange={(e) => setNumber("depth_min_m", e.target.value)} /></label>
              <label><span className="label">ความลึกสูงสุด (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.depth_max_m)} onChange={(e) => setNumber("depth_max_m", e.target.value)} /></label>
              <label><span className="label">ชื่อถนน</span><input className="input" maxLength={160} value={form.road_name} onChange={(e) => setText("road_name", e.target.value)} /></label>
              <label><span className="label">ความกว้างถนน (เมตร)</span><input type="number" min="0" className="input" value={numberValue(form.road_width_m)} onChange={(e) => setNumber("road_width_m", e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">รายละเอียดอื่น</span><textarea className="input min-h-28" maxLength={5000} value={form.description} onChange={(e) => setText("description", e.target.value)} placeholder="เช่น สาธารณูปโภค ไฟฟ้า น้ำ ทางเข้าออก" /></label>
            </div>
          </details>
        </section>

        <section id="sell-media" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("media","ไม่บังคับ · รองรับ JPG, PNG, WebP และ PDF สูงสุด 20MB ต่อไฟล์ เอกสารจะเก็บเป็น Private")}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-[#00A859]"><ImagePlus className="text-[#00A859]"/><span className="mt-2 text-sm font-bold">เพิ่มรูปทรัพย์</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={submitting} onChange={(e) => { uploadBatch(Array.from(e.target.files ?? []), "image"); e.target.value = ""; }}/></label>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-brand-500"><FileText className="text-brand-600"/><span className="mt-2 text-sm font-bold">เพิ่มเอกสาร</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" disabled={submitting} onChange={(e) => { uploadBatch(Array.from(e.target.files ?? []), "document"); e.target.value = ""; }}/></label>
          </div>
          {uploading && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><UploadCloud size={16}/>กำลังอัปโหลด...</div>}
          {failedUploads.current.size > 0 && <button type="button" className="mt-3 text-sm font-bold text-red-700" disabled={submitting || uploading} onClick={() => { for (const kind of ["image", "document"] as const) uploadBatch([...failedUploads.current].filter(([, mediaKind]) => mediaKind === kind).map(([file]) => file), kind); }}>ลองอัปโหลดไฟล์ที่ไม่สำเร็จอีกครั้ง</button>}
          {draft?.media && draft.media.length > 0 && <div className="mt-4 divide-y rounded-2xl border border-slate-200">{draft.media.map((media) => <div key={media.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="truncate">{media.file_name}</span><span className="shrink-0 text-xs text-slate-400">{media.media_kind === "image" ? "รูป" : "เอกสาร"}</span></div>)}</div>}
        </section>

        <section id="sell-contact" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("contact")}
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">ชื่อ – นามสกุล *</span><input className="input" autoComplete="name" maxLength={120} {...invalid("contact_name")} value={form.contact_name} onChange={(e) => setText("contact_name", e.target.value)}/>{fieldError("contact_name")}</label>
            <label><span className="label">เบอร์โทรศัพท์ *</span><input className="input" type="tel" autoComplete="tel" inputMode="tel" maxLength={32} {...invalid("contact_phone")} value={form.contact_phone} onChange={(e) => setText("contact_phone", e.target.value)}/>{fieldError("contact_phone")}</label>
            <label className="sm:col-span-2"><span className="label">LINE ID</span><input className="input" maxLength={100} value={form.contact_line} onChange={(e) => setText("contact_line", e.target.value)}/></label>
          </div>
        </section>

        <section id="sell-review" className="scroll-mt-20 px-4 py-6 sm:p-8">
          {heading("review")}
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
            <div><span className="text-slate-400">ประเภท</span><div className="font-bold">{form.property_type ? PROPERTY_TYPE_LABELS[form.property_type] : "-"} · ขาย</div></div>
            <div><span className="text-slate-400">ชื่อทรัพย์</span><div className="font-bold">{form.title || "-"}</div></div>
            <div><span className="text-slate-400">ขนาด</span><div className="font-bold">{[
              totalRai != null && totalRai > 0 ? `${totalRai.toLocaleString("th-TH", { maximumFractionDigits: 5 })} ไร่` : null,
              form.usable_area_sqm != null && form.usable_area_sqm > 0 ? `${form.usable_area_sqm.toLocaleString("th-TH")} ตร.ม.` : null,
            ].filter(Boolean).join(" · ") || "-"}</div></div>
            <div className="min-w-0"><span className="text-slate-400">ผู้ติดต่อ</span><div className="break-words font-bold">{[form.contact_name, form.contact_phone].filter(Boolean).join(" · ") || "-"}</div></div>
          </div>
          <label className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm text-slate-600 ${fieldErrors.consent ? "border-red-300" : "border-slate-200"}`}><input type="checkbox" className="mt-1" {...invalid("consent")} checked={consent} onChange={(e) => { setConsent(e.target.checked); clearFieldError("consent"); }}/><span>ยินยอมให้ LandmarketThai เก็บและใช้ข้อมูลที่ส่งเพื่อการตรวจสอบทรัพย์และติดต่อกลับตามนโยบายความเป็นส่วนตัว</span></label>
          {fieldError("consent")}
          <p className="mt-3 text-sm text-slate-500">ทีมงานตรวจสอบก่อนเผยแพร่ทุกครั้ง และจะติดต่อกลับภายใน 1 วันทำการ</p>
          {errorCount > 0 && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              กรุณาตรวจสอบ {errorCount} รายการ: {[...new Set((Object.keys(fieldErrors) as FieldKey[]).map((key) => SECTIONS[FIELD_SECTION[key]]))].join(", ")}
            </div>
          )}
          {saveState === "error" && saveError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</div>}
          <TurnstileWidget onToken={turnstile.onToken} action="property-submit" resetKey={turnstile.resetKey} />
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void saveDraft()} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-bold text-slate-500"><Save size={16}/>{saveState === "saving" ? "กำลังบันทึก..." : "บันทึกแบบร่าง"}</button>
            <button type="button" onClick={() => void submit()} disabled={submitting || (turnstile.enabled && !turnstile.token)} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "กำลังส่ง..." : "ส่งให้ทีมงานตรวจสอบ"} <Check size={17}/></button>
          </div>
        </section>
      </fieldset>
    </div>
  );
}
