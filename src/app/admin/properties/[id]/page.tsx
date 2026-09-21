import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { listingHref } from "@/lib/utils";
import type { Land, LandType, ListingStatus, ZoningColor } from "@/lib/types/database";
import { updateProperty } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "จัดการ Property", robots: { index: false, follow: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAND_TYPES: { value: LandType; label: string }[] = [
  { value: "industrial", label: "ที่ดินอุตสาหกรรม" }, { value: "eec", label: "EEC" },
  { value: "factory", label: "โรงงาน" }, { value: "warehouse", label: "คลังสินค้า" },
  { value: "logistics", label: "โลจิสติกส์" }, { value: "data_center", label: "Data Center" },
  { value: "investment", label: "ที่ดินลงทุน" },
];
const ZONINGS: { value: ZoningColor | ""; label: string }[] = [
  { value: "", label: "ยังไม่ระบุ" }, { value: "purple", label: "ม่วง" }, { value: "purple_light", label: "ม่วงอ่อน" },
  { value: "brown", label: "น้ำตาล" }, { value: "orange", label: "ส้ม" }, { value: "yellow", label: "เหลือง" },
  { value: "green", label: "เขียว" }, { value: "other", label: "อื่น ๆ" },
];
const STATUSES: { value: ListingStatus; label: string }[] = [
  { value: "draft", label: "Draft — ยังไม่เผยแพร่" }, { value: "active", label: "Active — เผยแพร่" },
  { value: "reserved", label: "Reserved" }, { value: "sold", label: "Sold" }, { value: "archived", label: "Archived" },
];

export default async function AdminPropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("/admin/properties");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const db = createServerClient();
  const [{ data: landData, error: landError }, { data: provinces, error: provinceError }] = await Promise.all([
    db.from("lands").select("*").eq("id", id).maybeSingle(),
    db.from("provinces").select("id,name_th").order("name_th"),
  ]);
  if (landError) throw new Error(`Load property failed: ${landError.message}`);
  if (!landData) notFound();
  if (provinceError) throw new Error(`Load provinces failed: ${provinceError.message}`);
  const land = landData as Land;

  let owner: { id: string; name: string; phone: string; referral_code: string | null } | null = null;
  if (land.owner_lead_id) {
    const { data, error } = await db.from("leads").select("id,name,phone,referral_code").eq("id", land.owner_lead_id).maybeSingle();
    if (error) console.error("Load property owner lead failed:", error.message);
    owner = data ?? null;
  }

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl max-w-5xl">
        <div className="mb-5 flex flex-wrap gap-4 text-sm">
          <Link href="/admin/properties" className="font-medium text-brand-600 hover:underline">← Property Backoffice</Link>
          {land.owner_lead_id && <Link href={`/admin/leads/${land.owner_lead_id}`} className="font-medium text-brand-600 hover:underline">Owner Lead →</Link>}
          {land.status === "active" && <Link href={listingHref(land.public_ref, land.slug)} target="_blank" className="font-medium text-brand-600 hover:underline">Public Listing →</Link>}
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-brand-600">Canonical Property</p>
          <h1 className="text-3xl font-bold text-slate-900">{land.title_th}</h1>
          {owner && <p className="mt-2 text-sm text-slate-500">Owner Lead: {owner.name} · {owner.phone} · Ref: {owner.referral_code || "ไม่มี"}</p>}
        </div>

        <div className="card p-6">
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            การเปลี่ยนเป็น <strong>Active</strong> คือจุด Human Approval สำหรับเผยแพร่ Property; ระบบไม่เปิดประกาศจาก Owner Lead อัตโนมัติ
          </div>
          <form action={updateProperty} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="land_id" value={land.id} />
            <div className="md:col-span-2"><label className="label" htmlFor="title_th">ชื่อประกาศ</label><input id="title_th" name="title_th" required maxLength={250} defaultValue={land.title_th} className="input" /></div>
            <div><label className="label" htmlFor="slug">Slug</label><input id="slug" name="slug" required maxLength={150} defaultValue={land.slug} className="input" /></div>
            <div><label className="label" htmlFor="status">สถานะ</label><select id="status" name="status" defaultValue={land.status} className="input">{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="label" htmlFor="province_id">จังหวัด</label><select id="province_id" name="province_id" defaultValue={land.province_id} className="input">{(provinces ?? []).map((province) => <option key={province.id} value={province.id}>{province.name_th}</option>)}</select></div>
            <div><label className="label" htmlFor="district">อำเภอ/พื้นที่</label><input id="district" name="district" maxLength={200} defaultValue={land.district ?? ""} className="input" /></div>
            <div><label className="label" htmlFor="land_type">ประเภท</label><select id="land_type" name="land_type" defaultValue={land.land_type} className="input">{LAND_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="label" htmlFor="zoning">ผังสี</label><select id="zoning" name="zoning" defaultValue={land.zoning ?? ""} className="input">{ZONINGS.map((item) => <option key={item.value || "none"} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="label" htmlFor="size_rai">ขนาด (ไร่)</label><input id="size_rai" name="size_rai" type="number" min="0.01" step="0.01" defaultValue={Number(land.size_rai)} className="input" /></div>
            <div><label className="label" htmlFor="price_per_rai">ราคา/ไร่ (บาท)</label><input id="price_per_rai" name="price_per_rai" type="number" min="1" step="1000" defaultValue={Number(land.price_per_rai)} className="input" /></div>
            <div><label className="label" htmlFor="referral_reward_max">ค่าตอบแทนสูงสุด (บาท)</label><input id="referral_reward_max" name="referral_reward_max" type="number" min="0" step="1000" defaultValue={land.referral_reward_max ?? ""} className="input" /></div>
            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" name="is_eec" defaultChecked={land.is_eec} /> อยู่ใน EEC</label>
            <div className="md:col-span-2"><button type="submit" className="btn-primary">บันทึก Property</button></div>
          </form>
        </div>
      </div>
    </section>
  );
}
