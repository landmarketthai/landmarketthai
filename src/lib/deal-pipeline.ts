import type { DealStage, DealStatus } from "@/lib/types/database";

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  qualified: "Qualified",
  property_sent: "ส่งข้อมูลแปลงแล้ว",
  site_visit: "นัดดูที่ดิน",
  negotiation: "เจรจา",
  offer: "เสนอราคา",
  deposit: "มัดจำ",
  won: "ปิดดีลสำเร็จ",
  lost: "ปิดไม่สำเร็จ",
};

export function dealStatusForStage(stage: DealStage): DealStatus {
  if (stage === "won") return "closed";
  if (stage === "lost") return "cancelled";
  return "in_progress";
}

export function isTerminalDealStage(stage: DealStage): boolean {
  return stage === "won" || stage === "lost";
}
