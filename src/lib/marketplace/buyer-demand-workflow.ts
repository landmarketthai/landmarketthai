import type { BuyerRequirementStatus } from "../types/database";

// Approved stays private. Matched pauses the search; closed ends it. Both hide the projection.
export const BUYER_ACTIONS = {
  approve: { from: ["pending_review", "rejected"], to: "approved", label: "อนุมัติ (ยังไม่เผยแพร่)" },
  publish: { from: ["approved"], to: "published", label: "เผยแพร่" },
  unpublish: { from: ["published"], to: "approved", label: "ถอนการเผยแพร่" },
  matched: { from: ["approved", "published"], to: "matched", label: "จับคู่แล้ว (หยุดเผยแพร่)" },
  closed: { from: ["pending_review", "approved", "published", "matched", "rejected", "expired"], to: "closed", label: "ปิดความต้องการ" },
  reject: { from: ["pending_review", "approved", "published"], to: "rejected", label: "ปฏิเสธ / ถอนการเผยแพร่" },
} as const;
export type BuyerAdminAction = keyof typeof BUYER_ACTIONS;

export function canApplyBuyerAction(status: BuyerRequirementStatus, action: BuyerAdminAction): boolean {
  return (BUYER_ACTIONS[action].from as readonly string[]).includes(status);
}

export const BUYER_STATUS_LABELS: Record<BuyerRequirementStatus, string> = {
  pending_review: "รอตรวจสอบ", approved: "อนุมัติ · ส่วนตัว", published: "เผยแพร่ · กำลังมองหา",
  rejected: "ปฏิเสธ · ส่วนตัว", matched: "จับคู่แล้ว · หยุดเผยแพร่", closed: "ปิดแล้ว · ส่วนตัว", expired: "หมดอายุ · ส่วนตัว",
};
