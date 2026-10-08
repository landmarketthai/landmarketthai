"use client";

import { useState } from "react";
import type { Land } from "@/lib/types/database";
import { getZoning, zoningSchema, listingMetadataDescription } from "@/lib/zoning";
import ZoningFields from "@/components/forms/ZoningFields";
import ZoningBadges from "@/components/listings/ZoningBadges";
import ListingCard from "@/components/listings/ListingCard";
import { resolveListingPresentation } from "@/lib/seed-listings";

function Editor({ land }: { land: Land }) {
  const [info, setInfo] = useState(getZoning(land));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = zoningSchema.safeParse(info);
  const preview = { ...land, zoning_info: info };
  async function save() {
    if (!parsed.success) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/zoning/${land.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoning_info: parsed.data, expected_updated_at: land.updated_at }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "บันทึกไม่สำเร็จ");
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ"); setSaving(false); }
  }
  return <div className="space-y-5">
    <ZoningFields initial={info} onChange={setInfo} review />
    {!parsed.success && <p role="alert" className="text-sm text-red-700">{parsed.error.issues.map(issue => issue.message).join(" · ")}</p>}
    {parsed.success && <>
      <h2 className="font-bold">ตัวอย่างหน้ารายละเอียด</h2><ZoningBadges land={preview} detail />
      <h2 className="font-bold">ตัวอย่างการ์ด</h2><div className="max-w-sm"><ListingCard land={preview} {...resolveListingPresentation(preview)} /></div>
      <h2 className="font-bold">ข้อความ metadata จากข้อมูลเดียวกัน</h2><p className="text-sm">{listingMetadataDescription(preview)}</p>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button type="button" className="btn-green" disabled={!parsed.success || saving} onClick={save}>{saving ? "กำลังบันทึก..." : "บันทึกข้อมูลผังเมือง"}</button>
  </div>;
}

export default function ZoningManager({ listings }: { listings: Land[] }) {
  const [slug, setSlug] = useState(listings[0].slug);
  const land = listings.find(item => item.slug === slug)!;
  return <div className="space-y-6">
    <label className="block text-sm">ประกาศ<select className="input mt-1" value={slug} onChange={event => setSlug(event.target.value)}>{listings.map(item => <option key={item.slug} value={item.slug}>{item.title_th}</option>)}</select></label>
    <Editor key={land.slug} land={land} />
  </div>;
}
