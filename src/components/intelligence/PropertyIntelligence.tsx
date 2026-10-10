import { zoningSummary } from "@/lib/zoning";
import Link from "next/link";
import type { Land } from "@/lib/types/database";
import { findInventoryComparables } from "@/lib/inventory-analytics";
import { getLandOverlayContext } from "@/lib/land-overlays";
import { rankNearbyAnchors } from "@/lib/location-intelligence";
import { resolveListingPresentation } from "@/lib/seed-listings";
import { formatMoneyFull, listingHref } from "@/lib/utils";

/** Read-only metadata component; callers supply only public active inventory. */
export function PropertyIntelligence({ land, inventory }: { land: Land; inventory: readonly Land[] }) {
  const context = getLandOverlayContext(land);
  const comparables = findInventoryComparables(land, inventory);
  const anchors = rankNearbyAnchors(land).slice(0, 3);
  return <section className="card space-y-4 p-5">
    <h2 className="text-lg font-bold">ข้อมูลประกอบการพิจารณาที่ดิน</h2>
    <p className="text-sm">{zoningSummary(land)} · EEC ตามประกาศ: {context.eec.reportedByListing ? "ใช่" : "ไม่ใช่"}</p>
    <p className="text-xs text-amber-800">ข้อมูลนี้ไม่รับรองสิทธิ์ EEC การอยู่ในนิคม หรือการอนุญาตใช้ที่ดิน ต้องให้ทีมงานตรวจสอบ ไม่มีข้อมูลขอบเขตพื้นที่ทางการ</p>
    <h3 className="font-semibold">จุดอ้างอิงใกล้เคียง</h3>
    {anchors.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีพิกัดแปลงเพียงพอสำหรับคำนวณระยะทาง</p> : <ul className="space-y-1 text-sm">{anchors.map(({ anchor, distanceKm }) => <li key={anchor.id}>{anchor.label} · {distanceKm.toFixed(1)} กม. เส้นตรงโดยประมาณ ไม่ใช่ระยะขับรถ</li>)}</ul>}
    <h3 className="font-semibold">ประกาศเปรียบเทียบ</h3>
    <p className="text-xs text-slate-500">เฉพาะประกาศที่เปิดขายของ LandmarketThai ในจังหวัดและประเภทเดียวกัน · ราคาตั้งขาย ไม่ใช่ราคาซื้อขายจริงหรือราคาประเมินตลาด · {comparables.listingCount} ตัวอย่าง</p>
    {comparables.comparables.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีประกาศเปรียบเทียบเพียงพอ</p> : <ul className="space-y-2">{comparables.comparables.map(({ land: comparable }) => <li key={comparable.id}>
      <Link className="text-sm font-medium text-brand-600 hover:underline" href={resolveListingPresentation(comparable).hrefOverride ?? listingHref(comparable.public_ref, comparable.slug)}>{comparable.title_th}</Link>
      <p className="text-xs text-slate-500">{comparable.price_per_rai == null ? "ยังไม่ระบุราคา" : `${formatMoneyFull(comparable.price_per_rai)} ต่อไร่`}</p>
    </li>)}</ul>}
  </section>;
}
