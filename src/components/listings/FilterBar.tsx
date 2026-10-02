import Link from "next/link";
import { LAND_CATEGORY_TYPES, LAND_TYPE_LABELS, ZONING_LABELS } from "@/lib/utils";
import { landSearchParams, type LandFilters } from "@/lib/land-search";
import type { Province } from "@/lib/types/database";

export default function FilterBar({ filters, provinces }: { filters: LandFilters; provinces: Pick<Province, "slug" | "name_th">[] }) {
  const values = landSearchParams(filters);
  return (
    <form action="/land" method="get" className="mb-6 grid gap-3 border-b border-slate-100 pb-6 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">ค้นหาคำ / อำเภอ
        <input name="q" type="search" maxLength={200} defaultValue={filters.q} className="input mt-1" placeholder="ชื่อแปลง ทำเล หรือรายละเอียด" />
      </label>
      <label className="text-sm">จังหวัด
        <select name="province" defaultValue={filters.province_slug ?? ""} className="input mt-1">
          <option value="">ทุกจังหวัด</option>
          {provinces.map(p => <option key={p.slug} value={p.slug}>{p.name_th}</option>)}
        </select>
      </label>
      <label className="text-sm">ประเภทที่ดิน
        <select name="type" defaultValue={filters.land_type ?? ""} className="input mt-1">
          <option value="">ทุกประเภท</option>
          {LAND_CATEGORY_TYPES.map((key) => <option key={key} value={key}>{LAND_TYPE_LABELS[key]}</option>)}
        </select>
      </label>
      <label className="text-sm">ผังเมือง
        <select name="zoning" defaultValue={filters.zoning ?? ""} className="input mt-1">
          <option value="">ทุกสีผังเมือง</option>
          {Object.entries(ZONING_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {[
        ["min_size", "ขนาดต่ำสุด (ไร่)"], ["max_size", "ขนาดสูงสุด (ไร่)"],
        ["min_price", "ราคาต่ำสุด (บาท/ไร่)"], ["max_price", "ราคาสูงสุด (บาท/ไร่)"],
      ].map(([name, label]) => (
        <label key={name} className="text-sm">{label}
          <input name={name} type="number" min="0" max="1000000000000" step="any" defaultValue={values.get(name) ?? ""} className="input mt-1" />
        </label>
      ))}
      <label className="text-sm">พื้นที่ EEC
        <select name="eec" defaultValue={values.get("eec") ?? ""} className="input mt-1">
          <option value="">ทั้งหมด</option><option value="true">เฉพาะ EEC</option><option value="false">นอก EEC</option>
        </select>
      </label>
      <div className="flex items-end gap-3">
        <button type="submit" className="btn-primary">ค้นหาที่ดิน</button>
        <Link href="/land" className="text-sm underline">ล้างตัวกรอง</Link>
      </div>
    </form>
  );
}
