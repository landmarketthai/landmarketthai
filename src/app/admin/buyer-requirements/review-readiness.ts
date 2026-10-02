import type { BuyerRequirement } from "@/lib/types/database";

export function buyerApprovalReadinessIssues(item: Pick<BuyerRequirement,
  "consent_pdpa" | "consent_pdpa_at" | "consent_public" | "consent_public_at"
>): string[] {
  const issues: string[] = [];
  if (!item.consent_pdpa || !item.consent_pdpa_at) issues.push("ไม่มีความยินยอม PDPA");
  if (item.consent_public && !item.consent_public_at) issues.push("ไม่มีหลักฐานความยินยอมเผยแพร่สาธารณะ");
  return issues;
}

export function buyerPublishReadinessIssues(item: Pick<BuyerRequirement,
  "consent_pdpa" | "consent_pdpa_at" | "consent_public" | "consent_public_at" | "reviewed_at" | "reviewed_by"
>): string[] {
  const issues = buyerApprovalReadinessIssues(item);
  if (!item.consent_public) issues.push("ไม่มีหลักฐานความยินยอมเผยแพร่สาธารณะ");
  if (!item.reviewed_at || !item.reviewed_by?.trim()) issues.push("ยังไม่มีหลักฐานการตรวจสอบโดยผู้ดูแล");
  return issues;
}
