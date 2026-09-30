import type { Land } from "@/lib/types/database";
import { LISTING_STATUS_LABELS, listingUpdatedLabel } from "@/lib/property-search";

export default function ListingTrust({ land, className = "" }: {
  land: Pick<Land, "status" | "updated_at">;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 ${className}`}>
      <span className="rounded bg-slate-100 px-2 py-1 font-semibold">สถานะ: {LISTING_STATUS_LABELS[land.status]}</span>
      <span>อัปเดตล่าสุด: <time dateTime={land.updated_at}>{listingUpdatedLabel(land.updated_at)}</time></span>
    </div>
  );
}
