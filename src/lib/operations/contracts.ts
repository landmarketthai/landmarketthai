import type { DealStage, DealStatus } from '@/lib/types/database';
import { dealStatusForStage } from '@/lib/operations/rules';

export { DEAL_STAGES, LEAD_STATUSES, LEAD_TRANSITIONS } from '@/lib/operations/rules';
export type { DealStage, LeadStatus } from '@/lib/types/database';

export interface DealClosureContract {
  stage: DealStage;
  status: DealStatus;
  closed_at: string | null;
  referral_converted: boolean;
}

export function dealClosureContract(stage: DealStage, closedAt: string | null): DealClosureContract {
  const status = dealStatusForStage(stage);
  return { stage, status, closed_at: status === 'in_progress' ? null : closedAt, referral_converted: stage === 'won' };
}
