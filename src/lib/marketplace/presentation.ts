import type { PropertyType, SubmissionStatus, TransactionType } from "@/lib/types/database";

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "แบบร่าง",
  pending_review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  published: "เผยแพร่แล้ว",
  rejected: "ปฏิเสธ",
  sold: "ขายแล้ว",
  expired: "หมดอายุ",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  land: "ที่ดิน",
  factory: "โรงงาน",
  warehouse: "โกดัง",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  sale: "ขาย",
};
