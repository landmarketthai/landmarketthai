"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import FieldError from "@/components/forms/FieldError";
import { THAI_PROVINCES } from "@/lib/constants/provinces";
import { leadSourceFromUrl, referralCodeFromUrl } from "@/lib/lead-attribution";

type LeadType = "buyer" | "partner" | "owner";
type FieldErrors = Record<string, string[]>;

const BUYER_LAND_TYPES = [
  ["industrial", "ที่ดินอุตสาหกรรม"],
  ["eec", "ที่ดิน EEC"],
  ["factory", "โรงงาน"],
  ["warehouse", "คลังสินค้า"],
  ["logistics", "โลจิสติกส์"],
  ["investment", "ลงทุน"],
] as const;

interface Props {
  listingId?: string;
  defaultType?: LeadType;
  compact?: boolean;
  referralCode?: string;
  heading?: string;
  submitLabel?: string;
}

export default function LeadForm({
  listingId,
  defaultType = "buyer",
  compact = false,
  referralCode,
  heading,
  submitLabel,
}: Props) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");
    setFieldErrors({});

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    if (data._hp) { setState("success"); return; }

    const currentUrl = typeof window !== "undefined" ? window.location.href : "/";
    const payload = {
      lead_type: defaultType,
      name: data.name,
      phone: data.phone,
      line_id: data.line_id || undefined,
      province: data.province || undefined,
      land_type: data.land_type || undefined,
      size_min_rai: data.size_min_rai ? Number(data.size_min_rai) : undefined,
      size_max_rai: data.size_max_rai ? Number(data.size_max_rai) : undefined,
      budget_min: data.budget_min ? Number(data.budget_min) : undefined,
      budget_max: data.budget_max ? Number(data.budget_max) : undefined,
      notes: data.notes || undefined,
      listing_id: listingId,
      referral_code: referralCode || data.referral_code || referralCodeFromUrl(currentUrl),
      consent_pdpa: data.consent_pdpa === "on" ? true : undefined,
      source: leadSourceFromUrl(currentUrl),
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json();
        const errs: FieldErrors = body?.error?.fieldErrors ?? {};
        setFieldErrors(errs);
        setErrorMsg("กรุณาตรวจสอบข้อมูลให้ครบถ้วน");
        setState("error");
        return;
      }

      if (!res.ok) {
        setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2 size={40} className="text-green-500" />
        <div>
          <div className="font-semibold text-slate-800 text-lg">ได้รับข้อมูลแล้ว!</div>
          <div className="text-sm text-slate-500 mt-1">
            ทีมงานจะติดต่อกลับภายใน 1 วันทำการ หรือเพิ่ม LINE เพื่อตอบเร็วขึ้น
          </div>
        </div>
        <LineButton label="เพิ่ม LINE OA เพื่อติดตามสถานะ" size="sm" />
      </div>
    );
  }

  const isLoading = state === "loading";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {/* Honeypot */}
      <input type="text" name="_hp" className="hidden" tabIndex={-1} autoComplete="off" />

      {!compact && (
        <h3 className="font-semibold text-slate-800 text-lg">
          {heading ??
            (defaultType === "buyer" ? "สนใจที่ดินนี้" :
             defaultType === "partner" ? "สมัครพาร์ทเนอร์" :
             "ส่งข้อมูลที่ดิน")}
        </h3>
      )}

      <div>
        <label className="label" htmlFor="lead-name">ชื่อ – นามสกุล *</label>
        <input
          id="lead-name"
          name="name"
          required
          className="input"
          placeholder="ชื่อ"
          disabled={isLoading}
          aria-describedby={fieldErrors.name?.length ? "err-lead-name" : undefined}
        />
        <FieldError id="err-lead-name" errors={fieldErrors.name} />
      </div>

      <div>
        <label className="label" htmlFor="lead-phone">เบอร์โทรศัพท์ *</label>
        <input
          id="lead-phone"
          name="phone"
          type="tel"
          required
          className="input"
          placeholder="เบอร์โทร"
          disabled={isLoading}
          aria-describedby={fieldErrors.phone?.length ? "err-lead-phone" : undefined}
        />
        <FieldError id="err-lead-phone" errors={fieldErrors.phone} />
      </div>

      <div>
        <label className="label" htmlFor="lead-line">LINE ID (ถ้ามี)</label>
        <input
          id="lead-line"
          name="line_id"
          className="input"
          placeholder="LINE ID"
          disabled={isLoading}
          aria-describedby={fieldErrors.line_id?.length ? "err-lead-line" : undefined}
        />
        <FieldError id="err-lead-line" errors={fieldErrors.line_id} />
      </div>

      {defaultType === "buyer" && !listingId && !compact && (
        <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lead-province">จังหวัดที่ต้องการ</label>
              <select id="lead-province" name="province" className="input" disabled={isLoading}>
                <option value="">ยังไม่ระบุ</option>
                {THAI_PROVINCES.map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lead-land-type">ประเภทที่ดิน</label>
              <select id="lead-land-type" name="land_type" className="input" disabled={isLoading}>
                <option value="">ยังไม่ระบุ</option>
                {BUYER_LAND_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lead-size-min">ขนาดเริ่มต้น (ไร่)</label>
              <input id="lead-size-min" name="size_min_rai" type="number" min="0" step="0.01" className="input" placeholder="เช่น 20" disabled={isLoading} aria-describedby={fieldErrors.size_min_rai?.length ? "err-lead-size-min" : undefined} />
              <FieldError id="err-lead-size-min" errors={fieldErrors.size_min_rai} />
            </div>
            <div>
              <label className="label" htmlFor="lead-size-max">ขนาดสูงสุด (ไร่)</label>
              <input id="lead-size-max" name="size_max_rai" type="number" min="0" step="0.01" className="input" placeholder="เช่น 50" disabled={isLoading} aria-describedby={fieldErrors.size_max_rai?.length ? "err-lead-size-max" : undefined} />
              <FieldError id="err-lead-size-max" errors={fieldErrors.size_max_rai} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lead-budget-min">งบเริ่มต้น (บาท)</label>
              <input id="lead-budget-min" name="budget_min" type="number" min="0" step="100000" className="input" placeholder="เช่น 50000000" disabled={isLoading} aria-describedby={fieldErrors.budget_min?.length ? "err-lead-budget-min" : undefined} />
              <FieldError id="err-lead-budget-min" errors={fieldErrors.budget_min} />
            </div>
            <div>
              <label className="label" htmlFor="lead-budget-max">งบสูงสุด (บาท)</label>
              <input id="lead-budget-max" name="budget_max" type="number" min="0" step="100000" className="input" placeholder="เช่น 100000000" disabled={isLoading} aria-describedby={fieldErrors.budget_max?.length ? "err-lead-budget-max" : undefined} />
              <FieldError id="err-lead-budget-max" errors={fieldErrors.budget_max} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lead-notes">รายละเอียดความต้องการ</label>
            <textarea id="lead-notes" name="notes" rows={3} maxLength={1000} className="input resize-y" placeholder="เช่น ต้องการสร้างโรงงาน ถนนรถเทรลเลอร์เข้าได้" disabled={isLoading} />
          </div>
        </div>
      )}

      <div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg py-1 text-xs leading-relaxed text-slate-600">
          <input
            type="checkbox"
            name="consent_pdpa"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
            disabled={isLoading}
            aria-describedby={fieldErrors.consent_pdpa?.length ? "err-lead-pdpa" : undefined}
          />
          <span>
            ยินยอมให้เก็บและใช้ข้อมูลส่วนบุคคล ตาม{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-brand-600"
            >
              นโยบายความเป็นส่วนตัว
            </a>
          </span>
        </label>
        <FieldError id="err-lead-pdpa" errors={fieldErrors.consent_pdpa} />
      </div>

      {state === "error" && (
        <div
          role="alert"
          className="flex items-center gap-2 text-red-700 text-sm bg-red-50 rounded-lg p-3 border border-red-100"
        >
          <AlertCircle size={16} aria-hidden />
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full justify-center text-base disabled:opacity-60"
      >
        {isLoading && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {isLoading ? "กำลังส่ง..." :
          submitLabel ??
          (defaultType === "buyer" ? "สนใจที่ดินนี้" :
           defaultType === "partner" ? "สมัครพาร์ทเนอร์" :
           "ส่งข้อมูลที่ดิน")}
      </button>
    </form>
  );
}
