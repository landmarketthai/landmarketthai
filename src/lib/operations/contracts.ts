export const LEAD_STATUSES = ["new", "contacting", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Won and lost are terminal until an explicit reopen action returns the lead to contacting.
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacting", "qualified", "lost"],
  contacting: ["qualified", "lost"],
  qualified: ["won", "lost"],
  won: ["contacting"],
  lost: ["contacting"],
};

export const DEAL_STAGES = ["open", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface DealClosureContract {
  stage: DealStage;
  status: "open" | "closed" | "cancelled";
  closed_at: string | null;
  referral_converted: boolean;
}

export function dealClosureContract(stage: DealStage, closedAt: string | null): DealClosureContract {
  return {
    stage,
    status: stage === "won" ? "closed" : stage === "lost" ? "cancelled" : "open",
    closed_at: stage === "open" ? null : closedAt,
    referral_converted: stage === "won",
  };
}
