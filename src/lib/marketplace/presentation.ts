import type { PropertyType, SubmissionStatus, TransactionType } from "@/lib/types/database";

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "แบบร่าง",
  pending_review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  published: "เผยแพร่แล้ว",
  rejected: "ปฏิเสธ",
  sold: "ขายแล้ว",
  expired: "เก็บถาวร",
};

/** Canonical property types in display order. Keep in sync with db/migrations/20261002_property_types_usable_area.sql. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  land: "ที่ดิน",
  house: "บ้านเดี่ยว",
  house_with_land: "บ้านพร้อมที่ดิน",
  townhouse: "ทาวน์เฮาส์/ทาวน์โฮม",
  condo: "คอนโด",
  housing_project: "หมู่บ้าน/โครงการ",
  commercial_building: "อาคารพาณิชย์",
  office: "อาคารสำนักงาน",
  factory: "โรงงาน",
  warehouse: "โกดัง/คลังสินค้า",
  apartment: "อพาร์ตเมนต์/หอพัก",
  hotel_resort: "โรงแรม/รีสอร์ต",
  retail: "ร้านค้า/พื้นที่พาณิชย์",
  business_property: "กิจการพร้อมอสังหา",
  other: "อื่น ๆ",
};

export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as [PropertyType, ...PropertyType[]];

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === "string" && Object.hasOwn(PROPERTY_TYPE_LABELS, value);
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  sale: "ขาย",
};

/** "12.5 ไร่" when land area exists, else "350 ตร.ม." for building-only assets. */
export function propertySizeLabel(property: { size_rai?: number | null; usable_area_sqm?: number | null }): string | null {
  if (property.size_rai != null && property.size_rai > 0) return `${property.size_rai.toLocaleString("th-TH", { maximumFractionDigits: 5 })} ไร่`;
  if (property.usable_area_sqm != null && property.usable_area_sqm > 0) return `${property.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.`;
  return null;
}
