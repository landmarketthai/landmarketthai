"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import FieldError from "@/components/forms/FieldError";
import { LAND_CATEGORY_TYPES, LAND_TYPE_LABELS } from "@/lib/utils";
import { THAI_PROVINCES } from "@/lib/constants/provinces";

type LeadType = "buyer" | "partner" | "owner";
type FieldErrors = Record<string, string[]>;

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

    const payload = {
      ...(defaultType === "buyer" && !compact ? {
        province: data.province || undefined,
        land_type: data.land_type || undefined,
        intended_use: data.intended_use || undefined,
        ...Object.fromEntries(["size_min_rai", "size_max_rai", "budget_min", "budget_max"].map(key => [key, data[key] ? Number(data[key]) : undefined])),
      } : {}),
      lead_type: defaultType,
      name: data.name,
      phone: data.phone,
      line_id: data.line_id || undefined,
      listing_id: listingId,
      referral_code: referralCode || data.referral_code || undefined,
      consent_pdpa: data.consent_pdpa === "on" ? true : undefined,
      source: typeof window !== "undefined" ? window.location.pathname : undefined,
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

      {defaultType === "buyer" && !compact && <>
        <label className="label">จังหวัด
          <select name="province" className="input mt-1" disabled={isLoading}><option value="">ทุกจังหวัด</option>{THAI_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}</select>
        </label>
        <label className="label">ประเภทที่ดิน
          <select name="land_type" className="input mt-1" disabled={isLoading}><option value="">ทุกประเภท</option>{LAND_CATEGORY_TYPES.map((value) => <option key={value} value={value}>{LAND_TYPE_LABELS[value]}</option>)}</select>
        </label>
        {([["size_min_rai", "ขนาดขั้นต่ำ (ไร่)"], ["size_max_rai", "ขนาดสูงสุด (ไร่)"], ["budget_min", "งบประมาณรวมขั้นต่ำ (บาท)"], ["budget_max", "งบประมาณรวมสูงสุด (บาท)"]] as const).map(([name, label]) => <div key={name}>
          <label className="label" htmlFor={`lead-${name}`}>{label}</label>
          <input id={`lead-${name}`} name={name} type="number" min="0" step="any" max="1000000000000" className="input" disabled={isLoading} aria-describedby={fieldErrors[name]?.length ? `err-${name}` : undefined} />
          <FieldError id={`err-${name}`} errors={fieldErrors[name]} />
        </div>)}
        <label className="label">การใช้ประโยชน์ที่ต้องการ<input name="intended_use" maxLength={500} className="input mt-1" disabled={isLoading} /></label>
      </>}

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
