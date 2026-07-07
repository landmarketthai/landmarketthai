"use client";

import { useState, useRef } from "react";
import { CheckCircle2, AlertCircle, Loader2, Upload, X } from "lucide-react";
import LineButton from "@/components/ui/LineButton";
import FieldError from "@/components/forms/FieldError";
import { THAI_PROVINCES, EEC_PROVINCES } from "@/lib/constants/provinces";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILES = 10;
const MAX_FILE_MB = 20;

interface FileItem {
  file: File;
  preview: string | null;
  status: "pending" | "uploading" | "done" | "error";
  storageKey?: string;
}

type FieldErrors = Record<string, string[]>;

export default function SubmitLandForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(added: File[]) {
    const valid = added
      .filter((f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_MB * 1024 * 1024)
      .slice(0, MAX_FILES - files.length);
    const items: FileItem[] = valid.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...items]);
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      const next = [...prev];
      if (next[i].preview) URL.revokeObjectURL(next[i].preview!);
      next.splice(i, 1);
      return next;
    });
  }

  async function uploadFile(item: FileItem, leadId: string): Promise<string | null> {
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          mimeType: item.file.type,
          fileSize: item.file.size,
          originalName: item.file.name,
        }),
      });
      if (!presignRes.ok) return null;
      const { uploadUrl, storageKey } = await presignRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": item.file.type },
        body: item.file,
      });
      if (!putRes.ok) return null;

      const confirmRes = await fetch("/api/uploads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          leadId,
          docType: item.file.type === "application/pdf" ? "title_deed" : "other",
          mimeType: item.file.type,
          fileSize: item.file.size,
          originalName: item.file.name,
        }),
      });
      if (!confirmRes.ok) return null;

      return storageKey;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");
    setFieldErrors({});

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data._hp) { setState("success"); return; }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_type: "owner",
          name: data.name,
          phone: data.phone,
          line_id: data.line_id || undefined,
          province: data.province,
          district: data.district || undefined,
          size_rai: Number(data.size_rai),
          asking_price: data.asking_price ? Number(data.asking_price) : undefined,
          deed_type: data.deed_type || undefined,
          notes: data.notes || undefined,
          consent_pdpa: data.consent_pdpa === "on" ? true : undefined,
          source: window.location.pathname,
        }),
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

      const { id } = await res.json();

      if (files.length > 0 && id) {
        setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" })));
        await Promise.all(
          files.map(async (item, i) => {
            const key = await uploadFile(item, id);
            setFiles((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], status: key ? "done" : "error", storageKey: key ?? undefined };
              return next;
            });
          })
        );
      }

      setState("success");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <CheckCircle2 size={48} className="text-green-500" />
        <div>
          <div className="text-xl font-bold text-slate-800">ได้รับข้อมูลแล้ว!</div>
          <div className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
            ทีมงานจะติดต่อกลับภายใน 1 วันทำการ
            เพิ่ม LINE เพื่อรับการอัปเดตแบบ real-time
          </div>
        </div>
        <LineButton label="เพิ่ม LINE OA ติดตามสถานะ" />
      </div>
    );
  }

  const isLoading = state === "loading";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <input type="text" name="_hp" className="hidden" tabIndex={-1} autoComplete="off" />

      <h2 className="font-semibold text-slate-800 text-lg">ข้อมูลติดต่อ</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="owner-name">ชื่อ – นามสกุล *</label>
          <input
            id="owner-name"
            name="name"
            required
            className="input"
            placeholder="ชื่อ"
            disabled={isLoading}
            aria-describedby={fieldErrors.name?.length ? "err-owner-name" : undefined}
          />
          <FieldError id="err-owner-name" errors={fieldErrors.name} />
        </div>
        <div>
          <label className="label" htmlFor="owner-phone">เบอร์โทร *</label>
          <input
            id="owner-phone"
            name="phone"
            type="tel"
            required
            className="input"
            placeholder="เบอร์โทร"
            disabled={isLoading}
            aria-describedby={fieldErrors.phone?.length ? "err-owner-phone" : undefined}
          />
          <FieldError id="err-owner-phone" errors={fieldErrors.phone} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="owner-line">LINE ID (ถ้ามี)</label>
        <input
          id="owner-line"
          name="line_id"
          className="input"
          placeholder="LINE ID"
          disabled={isLoading}
          aria-describedby={fieldErrors.line_id?.length ? "err-owner-line" : undefined}
        />
        <FieldError id="err-owner-line" errors={fieldErrors.line_id} />
      </div>

      <hr className="border-slate-100 my-1" />
      <h2 className="font-semibold text-slate-800 text-lg">ข้อมูลที่ดิน</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="owner-province">จังหวัด *</label>
          <select
            id="owner-province"
            name="province"
            required
            className="input"
            disabled={isLoading}
            aria-describedby={fieldErrors.province?.length ? "err-owner-province" : undefined}
          >
            <option value="">เลือกจังหวัด</option>
            <optgroup label="จังหวัด EEC">
              {EEC_PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </optgroup>
            <optgroup label="จังหวัดทั้งหมด">
              {THAI_PROVINCES.filter(
                (p) => !(EEC_PROVINCES as readonly string[]).includes(p)
              ).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </optgroup>
          </select>
          <FieldError id="err-owner-province" errors={fieldErrors.province} />
        </div>
        <div>
          <label className="label" htmlFor="owner-district">อำเภอ / ตำบล</label>
          <input
            id="owner-district"
            name="district"
            className="input"
            placeholder="อำเภอ"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="label" htmlFor="owner-size">พื้นที่ (ไร่) *</label>
          <input
            id="owner-size"
            name="size_rai"
            type="number"
            min={0.1}
            step={0.1}
            required
            className="input"
            placeholder="50"
            disabled={isLoading}
            aria-describedby={fieldErrors.size_rai?.length ? "err-owner-size" : undefined}
          />
          <FieldError id="err-owner-size" errors={fieldErrors.size_rai} />
        </div>
        <div>
          <label className="label" htmlFor="owner-price">ราคาขาย (บาท, ถ้ามี)</label>
          <input
            id="owner-price"
            name="asking_price"
            type="number"
            min={0}
            className="input"
            placeholder="100000000"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="label" htmlFor="owner-deed">ประเภทเอกสารสิทธิ์</label>
          <select id="owner-deed" name="deed_type" className="input" disabled={isLoading}>
            <option value="">เลือก</option>
            <option value="chanote">โฉนด (น.ส. 4)</option>
            <option value="ns3k">น.ส. 3 ก.</option>
            <option value="ns3">น.ส. 3</option>
            <option value="sor_por_kor">ส.ป.ก.</option>
            <option value="other">อื่นๆ</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="owner-notes">รายละเอียดเพิ่มเติม</label>
        <textarea
          id="owner-notes"
          name="notes"
          className="input min-h-24 resize-y"
          placeholder="เขตสี ผังเมือง สาธารณูปโภค ถนน ฯลฯ"
          disabled={isLoading}
        />
      </div>

      {/* File upload */}
      <div>
        <label className="label">อัปโหลดเอกสาร / รูปภาพ (ถ้ามี)</label>
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}
          onDragOver={(e) => e.preventDefault()}
        >
          <Upload size={24} className="text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">ลาก & วาง หรือคลิกเพื่อเลือกไฟล์</p>
          <p className="text-xs text-slate-400 mt-1">
            JPG, PNG, PDF · สูงสุด {MAX_FILE_MB} MB ต่อไฟล์ · {MAX_FILES} ไฟล์
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => addFiles([...e.target.files!])}
        />

        {files.length > 0 && (
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {files.map((f, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden bg-slate-100 aspect-square flex items-center justify-center text-xs text-slate-500"
              >
                {f.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="px-1 text-center truncate">{f.file.name}</span>
                )}
                {f.status === "uploading" && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 size={16} className="text-white animate-spin" />
                  </div>
                )}
                {f.status === "done" && (
                  <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                    <CheckCircle2 size={10} className="text-white" />
                  </div>
                )}
                {f.status === "error" && (
                  <div className="absolute top-1 right-1 bg-red-500 rounded-full p-0.5">
                    <X size={10} className="text-white" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 left-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`ลบไฟล์ ${f.file.name}`}
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDPA */}
      <div>
        <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            name="consent_pdpa"
            required
            className="mt-0.5 accent-brand-500"
            disabled={isLoading}
            aria-describedby={fieldErrors.consent_pdpa?.length ? "err-owner-pdpa" : undefined}
          />
          <span>
            ยินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลและเอกสารที่ดิน ตาม{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-brand-600"
            >
              นโยบายความเป็นส่วนตัว
            </a>{" "}
            (เอกสารเก็บในระบบ Private Storage เข้าถึงได้เฉพาะทีมงาน)
          </span>
        </label>
        <FieldError id="err-owner-pdpa" errors={fieldErrors.consent_pdpa} />
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
        className="btn-primary justify-center disabled:opacity-60"
      >
        {isLoading && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {isLoading ? "กำลังส่ง..." : "ส่งข้อมูลที่ดิน"}
      </button>
    </form>
  );
}
