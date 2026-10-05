import Link from "next/link";
import { ArrowRight, Handshake } from "lucide-react";
import { formatMoneyFull } from "@/lib/utils";

/** Gold = broker path. Same reward, three placements on the property page. */
export default function ReferralCallout({ reward, variant }: {
  reward: number;
  variant: "hero" | "mobile" | "sidebar";
}) {
  const amount = formatMoneyFull(reward);

  if (variant === "hero") {
    return (
      <Link
        href="/become-partner"
        className="rounded-2xl border border-gold-400/60 bg-[#071d4a]/80 px-4 py-4 shadow-lg transition-colors hover:bg-[#071d4a] sm:px-5"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gold-400">
          <Handshake size={14} />
          ค่าแนะนำผู้ซื้อสูงสุด
        </div>
        <div className="mt-1 text-xl font-black text-gold-400 sm:text-2xl">{amount}</div>
      </Link>
    );
  }

  if (variant === "mobile") {
    return (
      <Link
        href="/become-partner"
        className="col-span-2 flex items-center justify-between gap-3 rounded-xl bg-[#071d4a] p-3"
      >
        <div>
          <div className="text-sm text-gold-400">มีผู้ซื้อในมือ? ค่าแนะนำสูงสุด</div>
          <div className="mt-0.5 text-lg font-black text-gold-400">{amount}</div>
        </div>
        <ArrowRight size={18} className="shrink-0 text-gold-400" />
      </Link>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-amber-50/70 p-4 sm:p-5">
      <div className="text-sm font-semibold text-slate-700">มีผู้ซื้อในมือ?</div>
      <div className="mt-0.5 text-lg font-black text-gold-600">ค่าแนะนำสูงสุด {amount}</div>
      <Link href="/become-partner" className="btn-gold mt-3 w-full">
        <Handshake size={16} />
        แนะนำผู้ซื้อแปลงนี้
      </Link>
    </div>
  );
}
