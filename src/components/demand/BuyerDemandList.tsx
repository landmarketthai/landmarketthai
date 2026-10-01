import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import type { BuyerDemand } from "@/lib/types/database";
import { LAND_TYPE_LABELS, formatUpdatedDate } from "@/lib/utils";

export function demandSizeLabel(demand: Pick<BuyerDemand, "size_min_rai" | "size_max_rai">): string {
  if (demand.size_min_rai && demand.size_max_rai) return `${demand.size_min_rai}–${demand.size_max_rai} ไร่`;
  if (demand.size_min_rai) return `${demand.size_min_rai}+ ไร่`;
  if (demand.size_max_rai) return `ไม่เกิน ${demand.size_max_rai} ไร่`;
  return "ทุกขนาด";
}

/** Shared by the homepage and /buyer-demand so both render the same buyer_demand records. */
export default function BuyerDemandList({ demands, emptyAction }: { demands: BuyerDemand[]; emptyAction?: ReactNode }) {
  // Only slug-backed demands can link to a detail page; base the empty state on what is actually rendered.
  const visible = demands.filter((demand) => demand.slug?.trim());
  if (!visible.length) {
    return (
      <div className="rounded-2xl bg-slate-50 px-6 py-12 text-center">
        <h2 className="mb-2 text-lg font-semibold text-slate-700">ยังไม่มีความต้องการซื้อที่เปิดเผยต่อสาธารณะในขณะนี้</h2>
        <p className="mb-6 text-sm text-slate-500">เมื่อทีมงานเผยแพร่ความต้องการของผู้ซื้อ รายการจะแสดงที่นี่</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((demand) => {
        const postedLabel = formatUpdatedDate(demand.created_at);
        return (
          <Link key={demand.id} href={`/buyer-demand/${demand.slug}`} className="card group p-6 transition-shadow hover:shadow-md">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs text-slate-500">
                  {demand.province?.name_th ?? "ทุกพื้นที่"}
                  {demand.land_type ? ` · ${LAND_TYPE_LABELS[demand.land_type]}` : ""}
                </div>
                <div className="font-semibold text-slate-800 transition-colors group-hover:text-brand-600">
                  ต้องการ {demandSizeLabel(demand)}
                </div>
              </div>
            </div>
            {demand.intended_use && <p className="mb-3 line-clamp-2 text-sm text-slate-500">{demand.intended_use}</p>}
            {demand.budget_note && (
              <div className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">งบประมาณ: {demand.budget_note}</div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1 font-medium text-brand-600">แนะนำที่ดินนี้ <ArrowRight size={12} /></span>
              {postedLabel && <span className="text-slate-400">ลงประกาศ {postedLabel}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
