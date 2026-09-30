import type { InventoryAnalytics as Analytics, InventoryPriceGroup, PriceStatistics } from "@/lib/inventory-analytics";
import { LAND_TYPE_LABELS, ZONING_LABELS } from "@/lib/utils";
import type { LandType, ZoningColor } from "@/lib/types/database";

const money = (value: number | null) => value === null ? "ไม่มีข้อมูล" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function PriceRow({ label, stats, listingCount }: { label: string; stats: PriceStatistics; listingCount: number }) {
  return <tr className="border-t border-slate-200">
    <th scope="row" className="p-3 text-left font-medium">{label}</th>
    <td className="p-3">{listingCount}</td><td className="p-3">{stats.count}</td>
    <td className="p-3">{money(stats.min)}</td><td className="p-3">{money(stats.max)}</td>
    <td className="p-3">{money(stats.median)}</td><td className="p-3">{money(stats.average)}</td>
  </tr>;
}

export function InventoryAnalytics({ analytics }: { analytics: Analytics }) {
  const groups: { title: string; values: InventoryPriceGroup[]; label: (group: InventoryPriceGroup) => string }[] = [
    { title: "จังหวัด", values: analytics.byProvince, label: (group) => group.label === group.key ? "ยังไม่ระบุชื่อจังหวัด" : group.label },
    { title: "ประเภทที่ดิน", values: analytics.byLandType, label: (group) => LAND_TYPE_LABELS[group.key as LandType] ?? "ยังไม่ระบุประเภท" },
    { title: "ผังสีตามประกาศ", values: analytics.byZoning, label: (group) => ZONING_LABELS[group.key as ZoningColor] ?? "ยังไม่ระบุผังสี" },
  ];
  return <section className="space-y-6">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      ข้อมูลเฉพาะประกาศที่เปิดขายของ LandmarketThai เท่านั้น · ราคาตั้งขาย ไม่ใช่ราคาซื้อขายจริงหรือราคาประเมินตลาด · หน่วยบาทต่อไร่
      <br />จำนวนตัวอย่างราคาไม่นับราคาที่ขาดหายหรือไม่ถูกต้อง · ข้อมูลผังสีต้องตรวจสอบก่อนใช้งาน
    </p>
    {[{ title: "ภาพรวม", values: [{ key: "all", label: "ทั้งหมด", ...analytics }], label: (group: InventoryPriceGroup) => group.label }, ...groups].map((group) => <div key={group.title}>
      <h2 className="mb-3 text-lg font-bold">{group.title}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <caption className="sr-only">{group.title} — ราคาตั้งขายบาทต่อไร่ เฉพาะประกาศที่เปิดขายของ LandmarketThai</caption>
          <thead><tr><th scope="col" className="p-3 text-left">กลุ่ม</th>{["จำนวนประกาศ", "ตัวอย่างราคา", "ต่ำสุด", "สูงสุด", "มัธยฐาน", "เฉลี่ย"].map((label) => <th key={label} scope="col" className="p-3 text-left">{label}</th>)}</tr></thead>
          <tbody>{group.values.length === 0 ? <tr><td colSpan={7} className="p-3 text-slate-500">ไม่มีประกาศที่เปิดขายในกลุ่มนี้</td></tr> : group.values.map((value) => <PriceRow key={value.key} label={group.label(value)} listingCount={value.listingCount} stats={value.pricePerRai} />)}</tbody>
        </table>
      </div>
    </div>)}
  </section>;
}
