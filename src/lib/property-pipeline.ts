import type { DealStage, ListingStatus } from "@/lib/types/database";

export function listingStatusForDealStages(current: ListingStatus, stages: DealStage[]): ListingStatus {
  // Publication is always a human decision. Automation never activates draft/archived inventory.
  if (current === "draft" || current === "archived") return current;
  if (current === "sold") return "sold";

  if (stages.includes("won")) return "sold";
  if (stages.includes("deposit")) return "reserved";
  if (current === "reserved") return "active";
  return current;
}
