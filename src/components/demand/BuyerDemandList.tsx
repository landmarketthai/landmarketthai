import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import type { PublicBuyerDemand } from "@/lib/types/database";
import { LAND_TYPE_LABELS, ZONING_LABELS, formatMoneyFull, formatUpdatedDate } from "@/lib/utils";

export function isPublishedDemand(demand: PublicBuyerDemand): boolean {
  return demand.status === "published" && demand.is_public && !!demand.published_at && !!demand.slug?.trim();
}

export function demandProvinceLabel(demand: PublicBuyerDemand): string {
  return demand.province_names.length ? demand.province_names.join(" / ") : demand.province?.name_th ?? "ทุกพื้นที่";
}

export function demandSizeLabel(demand: Pick<PublicBuyerDemand, "size_min_rai" | "size_max_rai">): string {
  if (demand.size_min_rai != null && demand.size_max_rai != null) return `${demand.size_min_rai}–${demand.size_max_rai} ไร่`;
  if (demand.size_min_rai != null) return `${demand.size_min_rai}+ ไร่`;
  if (demand.size_max_rai != null) return `ไม่เกิน ${demand.size_max_rai} ไร่`;
  return "ทุกขนาด";
}

/** Render only the typed public criteria; never buyer-submitted free text. */
export function BuyerDemandCriteria({ demand }: { demand: PublicBuyerDemand }) {
  return (
    <dl className="grid gap-2 text-sm text-slate-600">
      {demand.max_price != null && <div><dt className="inline">งบประมาณสูงสุด: </dt><dd className="inline font-medium">{formatMoneyFull(demand.max_price)}</dd></div>}
      {demand.max_price_per_rai != null && <div><dt className="inline">ราคาสูงสุดต่อไร่: </dt><dd className="inline font-medium">{formatMoneyFull(demand.max_price_per_rai)}</dd></div>}
      {demand.zoning && ZONING_LABELS[demand.zoning] && <div><dt className="inline">ผังเมือง: </dt><dd className="inline">{ZONING_LABELS[demand.zoning]}</dd></div>}
      {demand.container_access != null && <div><dt className="inline">รถคอนเทนเนอร์: </dt><dd className="inline">{demand.container_access ? "ต้องเข้าได้" : "ไม่จำเป็น"}</dd></div>}
      {demand.high_voltage != null && <div><dt className="inline">ไฟฟ้าแรงสูง: </dt><dd className="inline">{demand.high_voltage ? "ต้องการ" : "ไม่จำเป็น"}</dd></div>}
    </dl>
  );
}

/** Shared by the homepage and /buyer-demand so both render the same buyer_demand records. */
export default function BuyerDemandList({ demands, emptyAction }: { demands: PublicBuyerDemand[]; emptyAction?: ReactNode }) {
  const visible = demands.filter(isPublishedDemand);
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
        const postedLabel = formatUpdatedDate(demand.published_at);
        return (
          <Link key={demand.slug} href={`/buyer-demand/${demand.slug}`} className="card group min-w-0 break-words p-4 transition-shadow hover:shadow-md sm:p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs text-slate-500">
                  {demandProvinceLabel(demand)}
                  {demand.land_type ? ` · ${LAND_TYPE_LABELS[demand.land_type]}` : " · ทุกประเภท: ที่ดิน โรงงาน โกดัง"}
                </div>
                <div className="font-semibold text-slate-800 transition-colors group-hover:text-brand-600">
                  ต้องการ {demandSizeLabel(demand)}
                </div>
              </div>
            </div>
            <BuyerDemandCriteria demand={demand} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1 font-medium text-brand-600">แนะนำทรัพย์นี้ <ArrowRight size={12} /></span>
              {postedLabel && <span className="text-slate-400">ลงประกาศ {postedLabel}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
