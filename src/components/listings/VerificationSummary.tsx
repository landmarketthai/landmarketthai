import { ChevronDown, ShieldCheck } from "lucide-react";
import type { Land } from "@/lib/types/database";
import { landVerification } from "@/lib/marketplace/verification";
import { LISTING_STATUS_LABELS, listingUpdatedLabel } from "@/lib/property-search";
import VerificationBadges from "@/components/listings/VerificationBadges";
import VerificationChecklist from "@/components/listings/VerificationChecklist";

/** One-line trust summary; the full per-dimension checklist stays one tap away. */
export default function VerificationSummary({ land }: { land: Land }) {
  const dimensions = landVerification(land);
  // ponytail: lead with the review result, not an "x/7" score that reads as a failing grade
  const reviewed = dimensions.find((dimension) => dimension.key === "review")?.state === "ok";

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ShieldCheck size={20} className={`shrink-0 ${reviewed ? "text-[#00A859]" : "text-slate-400"}`} />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-bold text-slate-900">{reviewed ? "ทีมงานตรวจสอบประกาศแล้ว" : "รอทีมงานตรวจสอบ"}</span>
          <span className="text-slate-500">
            {" · "}{LISTING_STATUS_LABELS[land.status]}
            {" · อัปเดต "}<time dateTime={land.updated_at}>{listingUpdatedLabel(land.updated_at)}</time>
          </span>
        </div>
        <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 p-3">
        <VerificationBadges land={land} />
        <VerificationChecklist dimensions={dimensions} />
      </div>
    </details>
  );
}
