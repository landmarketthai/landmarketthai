import type { Metadata } from "next";
import Link from "next/link";
import { getPublicInventory } from "@/lib/public-inventory";
import { searchProperties, type PropertySearchFilters } from "@/lib/property-search";
import { LAND_TYPE_LABELS } from "@/lib/utils";
import PropertySearchResults from "@/components/listings/PropertySearchResults";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "ค้นหาที่ดินพร้อมแผนที่",
  description: "ค้นหาที่ดินเปิดขาย เลือกหมุดบนแผนที่ ดูราคา ขนาด สถานะ และวันที่อัปเดตล่าสุด",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters: PropertySearchFilters = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const result = await getPublicInventory().catch((error) => {
    console.error("Public inventory unavailable", error);
    return null;
  });
  const inventory = result ?? [];
  const listings = searchProperties(inventory, filters);
  const provinces = [...new Map(inventory.filter((land) => land.province).map((land) => [land.province!.slug, land.province!])).values()];
  return (
    <div className="container-xl section">
      <h1 className="mb-2 text-2xl font-bold text-brand-900">{filters.history === "1" ? "ประวัติดีลที่ปิดแล้ว" : "ค้นหาทรัพย์พร้อมแผนที่"}</h1>
      <p className="mb-6 text-sm text-slate-600">{filters.history === "1" ? "แสดงเฉพาะทรัพย์ที่ปิดดีลแล้ว" : "แสดงทรัพย์เปิดขาย"} พร้อมสถานะและวันที่อัปเดตล่าสุด</p>
      <form action="/search" method="get" className="mb-6 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">ทำเล / ชื่อแปลง<input name="q" defaultValue={filters.q} className="input mt-1" placeholder="จังหวัด อำเภอ นิคม" /></label>
        <label className="text-sm">จังหวัด<select name="province" defaultValue={filters.province ?? ""} className="input mt-1">
          <option value="">ทุกจังหวัด</option>{provinces.map((province) => <option key={province.slug} value={province.slug}>{province.name_th}</option>)}
        </select></label>
        <label className="text-sm">ประเภท<select name="type" defaultValue={filters.type ?? ""} className="input mt-1">
          <option value="">ทุกประเภท</option>{Object.entries(LAND_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="text-sm">เรียงตาม<select name="sort" defaultValue={filters.sort ?? "updated"} className="input mt-1">
          <option value="updated">อัปเดตล่าสุด</option><option value="price_asc">ราคาต่อไร่ต่ำสุด</option><option value="size_desc">ขนาดมากที่สุด</option>
        </select></label>
        {([ ["min_price", "ราคาต่อไร่ขั้นต่ำ (บาท)"], ["max_price", "ราคาต่อไร่สูงสุด (บาท)"], ["min_size", "ขนาดขั้นต่ำ (ไร่)"], ["max_size", "ขนาดสูงสุด (ไร่)"] ] as const).map(([name, label]) =>
          <label key={name} className="text-sm">{label}<input type="number" min="0" step="any" name={name} defaultValue={filters[name]} className="input mt-1" /></label>)}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="history" value="1" defaultChecked={filters.history === "1"} />ดูเฉพาะประวัติดีลที่ปิดแล้ว</label>
        <button className="btn-green" type="submit">ค้นหา</button>
        <Link className="flex min-h-11 items-center justify-center text-sm text-blue-700 underline" href="/search">ล้างตัวกรอง</Link>
      </form>
      {filters.transaction_type === "rent" && <p className="mb-4 rounded bg-amber-50 p-3 text-sm">ขณะนี้ยังไม่มีรายการให้เช่าในระบบ <Link href="/search" className="underline">ดูทรัพย์เปิดขาย</Link></p>}
      {result === null ? <p role="alert" className="rounded-xl bg-amber-50 p-6">โหลดรายการไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง หรือติดต่อทีมงาน</p> : <PropertySearchResults listings={listings} />}
    </div>
  );
}
