import type { DealStage, DealStatus, LeadStatus, LeadType } from "@/lib/types/database";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "ใหม่",
  contacting: "กำลังติดต่อ",
  qualified: "ผ่านการคัดกรอง",
  won: "ปิดการขายสำเร็จ",
  lost: "ไม่สำเร็จ",
};

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  buyer: "ผู้ซื้อ / นักลงทุน",
  owner: "เจ้าของที่ดิน",
  partner: "พาร์ทเนอร์",
};

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  qualified: "คัดกรองแล้ว",
  property_sent: "ส่งข้อมูลทรัพย์แล้ว",
  site_visit: "นัดดูพื้นที่",
  negotiation: "เจรจา",
  offer: "ยื่นข้อเสนอ",
  deposit: "วางมัดจำ",
  won: "ปิดดีลสำเร็จ",
  lost: "ดีลไม่สำเร็จ",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  in_progress: "กำลังดำเนินการ",
  closed: "ปิดแล้ว",
  cancelled: "ยกเลิก",
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
export const LEAD_TYPES = Object.keys(LEAD_TYPE_LABELS) as LeadType[];
export const DEAL_STAGES = Object.keys(DEAL_STAGE_LABELS) as DealStage[];
export const DEAL_STATUSES = Object.keys(DEAL_STATUS_LABELS) as DealStatus[];

export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacting", "qualified", "lost"],
  contacting: ["qualified", "lost"],
  qualified: ["won", "lost", "contacting"],
  won: ["contacting"],
  lost: ["contacting"],
};

/** Ended leads (won/lost) only reopen to contacting when the admin explicitly asks to reopen. */
export function canTransitionLead(from: LeadStatus, to: LeadStatus, reopen = false): boolean {
  if (from === to) return true;
  if (!LEAD_TRANSITIONS[from]?.includes(to)) return false;
  return (from !== "won" && from !== "lost") || reopen;
}

export function nextLeadStatuses(from: LeadStatus): readonly LeadStatus[] {
  return LEAD_TRANSITIONS[from] ?? [];
}

export function isLeadOverdue(lead: { status: LeadStatus; next_action_at: string | null }, now = Date.now()): boolean {
  if (!lead.next_action_at || lead.status === "won" || lead.status === "lost") return false;
  const at = Date.parse(lead.next_action_at);
  return Number.isFinite(at) && at < now;
}

// ponytail: CRM times are entered and shown in Thai time (UTC+7, no DST) so server and client render identically.
const BANGKOK_MS = 7 * 3600_000;
export function toBangkokInput(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at + BANGKOK_MS).toISOString().slice(0, 16) : "";
}
export function fromBangkokInput(value: string): string | null {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null;
}
export const formatBangkok = (iso: string | null) => (iso ? toBangkokInput(iso).replace("T", " ") : "-");

export function dealStatusForStage(stage: DealStage): DealStatus {
  return stage === "won" ? "closed" : stage === "lost" ? "cancelled" : "in_progress";
}

export function isDealEnded(deal: { stage: DealStage; status: DealStatus }): boolean {
  return deal.stage === "won" || deal.stage === "lost" || deal.status !== "in_progress";
}

export interface StageTotals { count: number; value: number; commission: number }

/** Per-stage counts and sums; null values count as 0, never estimated. */
export function summarizeDeals<T extends { stage: DealStage; status: DealStatus; deal_value: number | null; expected_commission: number | null }>(deals: T[]) {
  const byStage = Object.fromEntries(DEAL_STAGES.map((stage) => [stage, { count: 0, value: 0, commission: 0, deals: [] as T[] }])) as Record<DealStage, StageTotals & { deals: T[] }>;
  for (const deal of deals) {
    const bucket = byStage[deal.stage];
    if (!bucket) continue;
    bucket.count++;
    bucket.value += deal.deal_value ?? 0;
    bucket.commission += deal.expected_commission ?? 0;
    bucket.deals.push(deal);
  }
  const open = deals.filter((deal) => !isDealEnded(deal)).reduce((total, deal) => ({
    count: total.count + 1, value: total.value + (deal.deal_value ?? 0), commission: total.commission + (deal.expected_commission ?? 0),
  }), { count: 0, value: 0, commission: 0 });
  return {
    byStage,
    open,
    won: { count: byStage.won.count, value: byStage.won.value, commission: byStage.won.commission },
  };
}

export type DealStateResult =
  | { ok: true; stage: DealStage; status: DealStatus; closedAt: "set" | "clear" | "keep" }
  | { ok: false; error: string };

/**
 * Stage drives status: won => closed, lost => cancelled, anything else => in_progress.
 * A bare status maps closed => won and cancelled => lost; in_progress alone cannot pick a stage.
 */
export function resolveDealState(current: { stage: DealStage; status: DealStatus }, input: { stage?: DealStage; status?: DealStatus }): DealStateResult {
  let stage = input.stage;
  if (!stage && input.status) {
    if (input.status === "closed") stage = "won";
    else if (input.status === "cancelled") stage = "lost";
    else if (isDealEnded(current)) return { ok: false, error: "ระบุขั้นตอนที่ต้องการเปิดดีลกลับมา" };
    else stage = current.stage;
  }
  stage ??= current.stage;
  const status = dealStatusForStage(stage);
  if (input.status && input.status !== status) return { ok: false, error: "สถานะไม่สอดคล้องกับขั้นตอนดีล" };
  const wasEnded = isDealEnded(current);
  const endsNow = status !== "in_progress";
  const closedAt = endsNow ? (wasEnded && current.stage === stage ? "keep" : "set") : wasEnded ? "clear" : "keep";
  return { ok: true, stage, status, closedAt };
}
