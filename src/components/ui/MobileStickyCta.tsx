import Link from "next/link";
import LineIcon from "@/components/ui/LineIcon";
import { LINE_OA } from "@/lib/constants/site";

export default function MobileStickyCta() {
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(4,16,44,0.10)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <Link
            href={LINE_OA}
            target="_blank"
            rel="noopener"
            className="btn-line min-h-11 flex-1 justify-center px-3 py-2.5 text-sm"
          >
            <LineIcon size={17} />
            ทัก LINE
          </Link>
          <Link
            href="/buy-request"
            className="btn-green min-h-11 flex-1 justify-center px-3 py-2.5 text-sm"
          >
            ฝากความต้องการซื้อ
          </Link>
        </div>
      </div>
      <div className="h-20 md:hidden" aria-hidden="true" />
    </>
  );
}
