import type { ZonedLand } from "@/lib/zoning";
import { getZoning, isZoningEmpty, zoningColors, zoningSummary, ZONING_NOTICE } from "@/lib/zoning";
import { ZONING_COLORS, ZONING_LABELS } from "@/lib/utils";

export default function ZoningBadges({ land, detail = false }: { land: ZonedLand; detail?: boolean }) {
  const info = getZoning(land);
  return <div className="space-y-2 rounded-lg bg-white p-2 text-xs text-slate-700">
    <div className="flex flex-wrap gap-2">{zoningColors(land).map(color => <span key={color} className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
      <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: ZONING_COLORS[color] }} />สี{ZONING_LABELS[color]}
    </span>)}</div>
    <p>{zoningSummary(land)}</p>
    {detail && !isZoningEmpty(info) && <>
      <dl className="grid gap-2 sm:grid-cols-2">
        {info.zones.map((zone, index) => <div key={index}><dt>ประเภท {index + 1}</dt><dd>{zone.type_code || "ยังไม่ทราบรหัส"} · {zone.type_name || "ยังไม่ทราบชื่อประเภท"}</dd></div>)}
        <div><dt>ชื่อผัง</dt><dd>{info.plan_name || "ยังไม่ทราบ"}</dd></div>
        <div><dt>แหล่งข้อมูล</dt><dd className="break-words">{info.source || "ยังไม่ระบุ"}</dd></div>
        <div><dt>วันที่ตรวจ</dt><dd>{info.checked_at || "ยังไม่ระบุ"}</dd></div>
      </dl>
      {info.evidence_url ? <a href={info.evidence_url} target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 underline">ดูแผนที่ / เอกสารประกอบ</a> : <p>ยังไม่มีหลักฐานทางการ</p>}
      <p>{ZONING_NOTICE}</p>
    </>}
  </div>;
}
