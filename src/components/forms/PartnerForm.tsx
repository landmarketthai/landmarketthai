"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import FieldError from "@/components/forms/FieldError";
import { submitPartnerLead } from "@/app/actions/leads";
import type { LeadActionState } from "@/app/actions/leads";
import { TurnstileWidget, useTurnstile } from "@/components/security/TurnstileWidget";

const WORKING_AREAS = [
  "EEC (ระยอง / ชลบุรี / ฉะเชิงเทรา)",
  "กรุงเทพฯ และปริมณฑล",
  "ภาคกลาง",
  "ภาคเหนือ",
  "ภาคอีสาน",
  "ภาคใต้",
  "ทั่วประเทศ",
];

const EXPERIENCE_OPTIONS = [
  { value: "none", label: "ไม่มีประสบการณ์" },
  { value: "<1y", label: "น้อยกว่า 1 ปี" },
  { value: "1-3y", label: "1–3 ปี" },
  { value: "3-5y", label: "3–5 ปี" },
  { value: "5y+", label: "5 ปีขึ้นไป" },
];

const NETWORK_OPTIONS = [
  { value: "small", label: "เพื่อน/ครอบครัว (< 20 คน)" },
  { value: "medium", label: "เครือข่ายขนาดกลาง (20–100 คน)" },
  { value: "large", label: "เครือข่ายธุรกิจ (100+ คน)" },
];

const INITIAL_STATE: LeadActionState = { status: "idle" };

interface Props {
  referralCode?: string;
}

export default function PartnerForm({ referralCode }: Props) {
  const [state, formAction, isPending] = useActionState(submitPartnerLead, INITIAL_STATE);
  const turnstile = useTurnstile();
  // Tokens are single-use: FormData is already captured, so reset right after every attempt.
  const submit = (formData: FormData) => {
    formAction(formData);
    turnstile.reset();
  };

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <CheckCircle2 size={48} className="text-green-500" />
        <div>
          <div className="text-xl font-bold text-slate-800">สมัครสำเร็จ!</div>
          <div className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
            ทีมงานจะติดต่อกลับภายใน 1 วันทำการ
            พร้อมส่งรหัส Referral ของคุณทาง LINE
          </div>
        </div>
        <LineButton label="เพิ่ม LINE OA รับรหัส Referral" />
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={submit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot */}
      <input type="text" name="_hp" className="hidden" tabIndex={-1} autoComplete="off" />
      <input type="hidden" name="turnstile_token" value={turnstile.token ?? ""} />
      {referralCode && <input type="hidden" name="referral_code" value={referralCode} />}
      <input type="hidden" name="source" value="/become-partner" />

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="partner-name">ชื่อ – นามสกุล *</label>
          <input
            id="partner-name"
            name="name"
            required
            className="input"
            placeholder="ชื่อ"
            disabled={isPending}
            aria-describedby={fieldErrors.name?.length ? "err-partner-name" : undefined}
          />
          <FieldError id="err-partner-name" errors={fieldErrors.name} />
        </div>
        <div>
          <label className="label" htmlFor="partner-phone">เบอร์โทร *</label>
          <input
            id="partner-phone"
            name="phone"
            type="tel"
            required
            className="input"
            placeholder="เบอร์โทร"
            disabled={isPending}
            aria-describedby={fieldErrors.phone?.length ? "err-partner-phone" : undefined}
          />
          <FieldError id="err-partner-phone" errors={fieldErrors.phone} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="partner-line">LINE ID (ถ้ามี)</label>
        <input
          id="partner-line"
          name="line_id"
          className="input"
          placeholder="LINE ID"
          disabled={isPending}
          aria-describedby={fieldErrors.line_id?.length ? "err-partner-line" : undefined}
        />
        <FieldError id="err-partner-line" errors={fieldErrors.line_id} />
      </div>

      <div>
        <label className="label" htmlFor="partner-area">พื้นที่ที่คุณมีความสัมพันธ์</label>
        <select
          id="partner-area"
          name="working_area"
          className="input"
          disabled={isPending}
        >
          <option value="">เลือกพื้นที่ (ถ้ามี)</option>
          {WORKING_AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <FieldError errors={fieldErrors.working_area} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="partner-exp">ประสบการณ์ด้านอสังหาฯ</label>
          <select id="partner-exp" name="experience" className="input" disabled={isPending}>
            <option value="">เลือก (ถ้ามี)</option>
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldError errors={fieldErrors.experience} />
        </div>
        <div>
          <label className="label" htmlFor="partner-network">ขนาดเครือข่าย</label>
          <select id="partner-network" name="network_size" className="input" disabled={isPending}>
            <option value="">เลือก (ถ้ามี)</option>
            {NETWORK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldError errors={fieldErrors.network_size} />
        </div>
      </div>

      <div>
        <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            name="consent_pdpa"
            required
            className="mt-0.5 accent-brand-500"
            disabled={isPending}
            aria-describedby={fieldErrors.consent_pdpa?.length ? "err-partner-pdpa" : undefined}
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
        <FieldError id="err-partner-pdpa" errors={fieldErrors.consent_pdpa} />
      </div>

      <TurnstileWidget onToken={turnstile.onToken} resetKey={turnstile.resetKey} action="partner_lead" />
      {turnstile.enabled && !turnstile.token && !isPending && (
        <p className="text-xs text-slate-500">กำลังยืนยันว่าคุณไม่ใช่บอท หากปุ่มยังกดไม่ได้ กรุณารีเฟรชหน้าแล้วลองใหม่</p>
      )}

      {state.status === "error" && (
        <div
          role="alert"
          className="flex items-center gap-2 text-red-700 text-sm bg-red-50 rounded-lg p-3 border border-red-100"
        >
          <AlertCircle size={16} aria-hidden />
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || (turnstile.enabled && !turnstile.token)}
        className="btn-gold w-full justify-center disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {isPending ? "กำลังส่ง..." : "สมัครผู้แนะนำ"}
      </button>
    </form>
  );
}
