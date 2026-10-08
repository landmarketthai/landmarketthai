import { z } from "zod";
import type { Land, ZoningColor } from "@/lib/types/database";
import { ZONING_LABELS } from "@/lib/utils";

export const ZONING_STATUS_LABELS = {
  unknown: "ยังไม่ทราบ",
  owner_reported: "ผู้ประกาศแจ้ง",
  map_checked: "ตรวจจากแผนที่",
  document_verified: "มีเอกสารยืนยัน",
} as const;

export const ZONING_NOTICE = "สีผังเมืองเพียงอย่างเดียวไม่ยืนยันว่าสร้างโรงงานได้ ต้องตรวจข้อกำหนดและการอนุญาตกับหน่วยงานที่เกี่ยวข้อง";
const optionalText = z.string().trim().max(500).default("");
export const zoningSchema = z.object({
  zones: z.array(z.object({
    color: z.enum(Object.keys(ZONING_LABELS) as [ZoningColor, ...ZoningColor[]]).nullable(),
    type_code: optionalText,
    type_name: optionalText,
  }).strict()).max(20).default([]),
  status: z.enum(["unknown", "owner_reported", "map_checked", "document_verified"]).default("unknown"),
  plan_name: optionalText,
  source: optionalText,
  checked_at: z.union([z.literal(""), z.iso.date()]).default(""),
  evidence_url: z.union([z.literal(""), z.url().max(2000).refine(value => /^https?:\/\//.test(value), "ใช้ลิงก์ http หรือ https")]).default(""),
}).strict().superRefine((value, context) => {
  if (["map_checked", "document_verified"].includes(value.status)) {
    for (const field of ["source", "checked_at", "evidence_url"] as const) {
      if (!value[field]) context.addIssue({ code: "custom", path: [field], message: { source: "ระบุแหล่งข้อมูลสำหรับสถานะนี้", checked_at: "ระบุวันที่ตรวจสำหรับสถานะนี้", evidence_url: "ระบุลิงก์หลักฐานสำหรับสถานะนี้" }[field] });
    }
  }
});
export type ZoningInfo = z.infer<typeof zoningSchema>;
export const ownerZoningSchema = zoningSchema.refine(
  info => info.status === "unknown" || info.status === "owner_reported",
  "ผู้ประกาศส่งข้อมูลได้เฉพาะสถานะยังไม่ทราบหรือผู้ประกาศแจ้ง ต้องให้ผู้ดูแลตรวจหลักฐานก่อนยืนยัน",
);
export type ZonedLand = Pick<Land, "zoning" | "zoning_info">;

export function getZoning(land: ZonedLand): ZoningInfo {
  if (land.zoning_info != null) {
    const result = zoningSchema.safeParse(land.zoning_info);
    // Invalid structured data must never regain a verified status through a legacy field.
    return result.success ? result.data : zoningSchema.parse({});
  }
  // Legacy color has no recorded provenance: show the color but never claim who reported it.
  return zoningSchema.parse({ zones: land.zoning ? [{ color: land.zoning }] : [] });
}

export const ZONING_EMPTY_LABEL = "ยังไม่ระบุผังเมือง";

/** True when nothing at all is known; zoning is optional for publishing. */
export function isZoningEmpty(info: ZoningInfo): boolean {
  return !info.zones.length && info.status === "unknown" && !info.plan_name && !info.source && !info.checked_at && !info.evidence_url;
}

export function zoningColors(land: ZonedLand): ZoningColor[] {
  return [...new Set(getZoning(land).zones.flatMap(zone => zone.color ? [zone.color] : []))];
}

export function sharesZoning(a: ZonedLand, b: ZonedLand): boolean {
  return zoningColors(a).some(color => color !== "other" && zoningColors(b).includes(color));
}

export function zoningSummary(land: ZonedLand): string {
  const info = getZoning(land);
  if (isZoningEmpty(info)) return `ผังเมือง: ${ZONING_EMPTY_LABEL}`;
  const colors = zoningColors(land).map(color => `สี${ZONING_LABELS[color]}`).join(" / ") || "ยังไม่ระบุสี";
  return `ผังเมือง: ${colors} · ${ZONING_STATUS_LABELS[info.status]}`;
}

export function listingMetadataDescription(land: Land): string {
  return `${land.title_th} ${land.province?.name_th ?? ""} ${land.size_rai} ไร่ · ${zoningSummary(land)} · ${ZONING_NOTICE}`;
}

export function zoningFromForm(form: FormData): unknown {
  const raw = form.get("zoning_info");
  if (typeof raw !== "string") return {};
  try { return JSON.parse(raw); } catch { return null; }
}
