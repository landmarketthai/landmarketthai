"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, X } from "lucide-react";
import LineIcon from "@/components/ui/LineIcon";
import LeadForm from "@/components/forms/LeadForm";
import { LINE_OA } from "@/lib/constants/site";
import { formatMoney } from "@/lib/utils";

interface Props {
  listingId?: string;
  listingRef?: number | null;
  listingTitle: string;
  soldOut?: boolean;
  referralReward?: number | null;
}

export default function PropertyMobileActions({
  listingId,
  listingRef,
  listingTitle,
  soldOut = false,
  referralReward = null,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const reference = listingRef && listingRef > 0 ? `รหัสประกาศ #${listingRef}` : listingTitle;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/96 px-3 py-2 shadow-[0_-4px_20px_rgba(4,16,44,0.12)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          {soldOut ? (
            <Link href="/search?status=active" className="btn-green min-h-11 flex-1 justify-center px-2 text-sm">
              ดูทรัพย์เปิดขาย
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="btn-green min-h-11 flex-1 justify-center px-2 text-sm"
                aria-label={`ขอข้อมูล ${reference}`}
              >
                ขอข้อมูล
              </button>
              {referralReward != null && (
                <Link
                  href="/become-partner"
                  className="btn-gold min-h-11 flex-1 flex-col gap-0 px-2 py-1 leading-tight"
                  aria-label={`แนะนำผู้ซื้อ รับค่าแนะนำสูงสุด ${formatMoney(referralReward)} บาท`}
                >
                  <span className="text-[11px] font-semibold">แนะนำผู้ซื้อ</span>
                  <span>รับ {formatMoney(referralReward)}</span>
                </Link>
              )}
            </>
          )}

          <a
            href={LINE_OA}
            target="_blank"
            rel="noopener noreferrer"
            className={soldOut ? "btn-line min-h-11 flex-1 justify-center px-2 text-sm" : "btn-line min-h-11 w-11 shrink-0 px-0"}
            aria-label={soldOut ? `ทัก LINE เพื่อสอบถามทรัพย์ใกล้เคียงจาก ${reference}` : `ทัก LINE เพื่อสอบถาม ${reference}`}
          >
            <LineIcon size={soldOut ? 17 : 20} />
            {soldOut && "ทัก LINE"}
          </a>
          {!soldOut && (
            <a
              href="tel:0860555595"
              className="btn-outline min-h-11 w-11 shrink-0 border px-0"
              aria-label={`โทรสอบถาม ${reference}`}
            >
              <Phone size={18} />
            </a>
          )}
        </div>
      </div>
      {open && !soldOut && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="ขอข้อมูลทรัพย์">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55"
            onClick={() => setOpen(false)}
            aria-label="ปิดแบบฟอร์ม"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">ขอข้อมูลแปลงนี้</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{reference}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700"
                aria-label="ปิด"
              >
                <X size={20} />
              </button>
            </div>
            <LeadForm listingId={listingId} compact defaultType="buyer" submitLabel="ขอข้อมูลทรัพย์นี้" />
          </div>
        </div>
      )}
    </>
  );
}
