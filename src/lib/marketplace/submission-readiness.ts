import type { PropertySubmission } from "@/lib/types/database";

export function submissionReadinessIssues(draft: PropertySubmission): string[] {
  const missing: string[] = [];
  if (!draft.property_type) missing.push("ประเภททรัพย์");
  if (!draft.transaction_type) missing.push("ประเภทการทำรายการ");
  if (!draft.title?.trim()) missing.push("ชื่อทรัพย์");
  if (!draft.province_id) missing.push("จังหวัด");
  if (draft.total_rai == null || draft.total_rai <= 0) missing.push("ขนาดพื้นที่");
  if (!draft.contact_name?.trim()) missing.push("ชื่อผู้ติดต่อ");
  if (!draft.contact_phone?.trim()) missing.push("เบอร์โทรศัพท์");
  if (draft.transaction_type === "sale" && (draft.sale_price == null || draft.sale_price <= 0)) missing.push("ราคาขาย");
  if (draft.transaction_type === "rent" && (draft.rent_price_monthly == null || draft.rent_price_monthly <= 0)) missing.push("ค่าเช่า");
  return missing;
}
