import Link from "next/link";

export default function MobileStickyCta() {
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-4px_20px_rgba(4,16,44,0.10)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
          <Link href="/search" className="btn-green min-h-11 justify-center px-2 py-2.5 text-sm">
            ซื้อ
          </Link>
          <Link href="/sell" className="btn-outline min-h-11 justify-center px-2 py-2.5 text-sm">
            ขาย
          </Link>
          <Link
            href="/become-partner"
            className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2.5 text-center text-sm font-bold text-amber-900"
          >
            แนะนำ
          </Link>
        </div>
      </div>
      <div className="h-20 md:hidden" aria-hidden="true" />
    </>
  );
}
