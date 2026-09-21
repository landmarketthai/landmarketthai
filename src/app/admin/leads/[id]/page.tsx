import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { rankBuyerMatches } from "@/lib/buyer-matching";
import { mergeWithSeedListings, resolveListingPresentation } from "@/lib/seed-listings";
import { formatMoneyFull, listingHref } from "@/lib/utils";
import type { Land, Lead, LeadActivity, LeadStatus, LeadType } from "@/lib/types/database";
import {
  addLeadActivity,
  updateLeadAssignee,
  updateLeadNextAction,
  updateLeadStatus,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รายละเอียด Lead",
  robots: { index: false, follow: false },
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "ใหม่" },
  { value: "contacting", label: "กำลังติดต่อ" },
  { value: "qualified", label: "ผ่านการคัดกรอง" },
  { value: "won", label: "ปิดดีล" },
  { value: "lost", label: "ไม่สำเร็จ" },
];

const TYPE_LABELS: Record<LeadType, string> = {
  buyer: "ผู้ซื้อ",
  owner: "เจ้าของที่ดิน",
  partner: "พาร์ทเนอร์",
};

const ACTIVITY_LABELS: Record<LeadActivity["activity_type"], string> = {
  note: "บันทึก",
  call: "โทรศัพท์",
  line: "LINE",
  site_visit: "นัดดูที่ดิน",
  other: "อื่น ๆ",
};

const DETAIL_LABELS: Record<string, string> = {
  province: "จังหวัด",
  district: "อำเภอ",
  land_type: "ประเภทที่ดิน",
  size_rai: "ขนาด (ไร่)",
  budget_min: "งบเริ่มต้น",
  budget_max: "งบสูงสุด",
  asking_price: "ราคาที่ต้องการ",
  deed_type: "เอกสารสิทธิ์",
  working_area: "พื้นที่ทำงาน",
  experience: "ประสบการณ์",
  network_size: "เครือข่าย",
  notes: "หมายเหตุจากฟอร์ม",
  listing_id: "ประกาศ",
  raw_referral_code: "รหัสแนะนำที่ยังไม่ยืนยัน",
};

function formatThaiDate(value: string) {
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function datetimeLocalBangkok(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminLeadDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const db = createServerClient();
  const [{ data: leadData, error: leadError }, { data: activityData, error: activityError }] = await Promise.all([
    db
      .from("leads")
      .select("id,lead_type,name,phone,line_id,source,referral_code,status,assigned_to,next_action_at,details,consent_pdpa,consent_at,created_at,updated_at")
      .eq("id", id)
      .maybeSingle(),
    db
      .from("lead_activities")
      .select("id,lead_id,activity_type,note,created_by,created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (leadError) throw new Error(`Load lead failed: ${leadError.message}`);
  if (!leadData) notFound();
  if (activityError) throw new Error(`Load lead activities failed: ${activityError.message}`);

  const lead = leadData as Lead;
  const activities = (activityData ?? []) as LeadActivity[];
  const detailEntries = Object.entries(lead.details).filter(([, value]) => value !== null && value !== undefined && value !== "");

  let buyerMatches = [] as ReturnType<typeof rankBuyerMatches>;
  if (lead.lead_type === "buyer") {
    const { data: landData, error: landError } = await db
      .from("lands")
      .select("*, province:provinces(*), images:land_images(*)")
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(100);

    if (landError) console.error("Load buyer matching inventory failed:", landError.message);
    const inventory = mergeWithSeedListings((landData ?? []) as Land[]);
    buyerMatches = rankBuyerMatches(lead.details, inventory, 5);
  }

  return (
    <section className="section min-h-[80vh] bg-slate-50">
      <div className="container-xl max-w-6xl">
        <Link href="/admin/leads" className="mb-5 inline-flex text-sm font-medium text-brand-600 hover:underline">
          ← กลับรายการ Lead
        </Link>

        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">{TYPE_LABELS[lead.lead_type]}</p>
            <h1 className="text-3xl font-bold text-slate-900">{lead.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <a href={`tel:${lead.phone}`} className="text-brand-600 hover:underline">{lead.phone}</a>
              {lead.line_id && <span>LINE: {lead.line_id}</span>}
              {lead.referral_code && <span>Ref: {lead.referral_code}</span>}
              <span>สร้างเมื่อ {formatThaiDate(lead.created_at)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Source: <strong className="text-slate-900">{lead.source || "—"}</strong>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">จัดการ Lead</h2>
              <div className="space-y-4">
                <form action={updateLeadStatus} className="space-y-2">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <label className="label" htmlFor="status">สถานะ</label>
                  <div className="flex gap-2">
                    <select id="status" name="status" defaultValue={lead.status} className="input">
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary shrink-0 px-4">บันทึก</button>
                  </div>
                </form>

                <form action={updateLeadAssignee} className="space-y-2">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <label className="label" htmlFor="assigned_to">ผู้รับผิดชอบ</label>
                  <div className="flex gap-2">
                    <input id="assigned_to" name="assigned_to" defaultValue={lead.assigned_to ?? ""} maxLength={100} className="input" placeholder="ชื่อผู้ดูแล" />
                    <button type="submit" className="btn-outline shrink-0 px-4">บันทึก</button>
                  </div>
                </form>

                <form action={updateLeadNextAction} className="space-y-2">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <label className="label" htmlFor="next_action_at">นัดติดตามครั้งถัดไป</label>
                  <div className="flex gap-2">
                    <input id="next_action_at" name="next_action_at" type="datetime-local" defaultValue={datetimeLocalBangkok(lead.next_action_at)} className="input" />
                    <button type="submit" className="btn-outline shrink-0 px-4">บันทึก</button>
                  </div>
                  <p className="text-xs text-slate-500">เวลากรุงเทพฯ · ล้างค่าแล้วกดบันทึกเพื่อลบนัด</p>
                </form>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">ข้อมูลที่ Lead ส่งมา</h2>
              {detailEntries.length === 0 ? (
                <p className="text-sm text-slate-500">ไม่มีรายละเอียดเพิ่มเติม</p>
              ) : (
                <dl className="space-y-3 text-sm">
                  {detailEntries.map(([key, value]) => (
                    <div key={key} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <dt className="text-xs font-medium text-slate-500">{DETAIL_LABELS[key] ?? key}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-slate-800">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">บันทึกกิจกรรม</h2>
              <form action={addLeadActivity} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <div>
                  <label className="label" htmlFor="activity_type">ประเภท</label>
                  <select id="activity_type" name="activity_type" defaultValue="note" className="input">
                    {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="note">รายละเอียด</label>
                  <textarea id="note" name="note" required maxLength={2000} rows={4} className="input resize-y" placeholder="เช่น โทรคุยแล้ว สนใจนัดดูแปลงวันเสาร์" />
                </div>
                <button type="submit" className="btn-primary">เพิ่มกิจกรรม</button>
              </form>
            </div>

            {lead.lead_type === "buyer" && (
              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">แปลงที่ระบบแนะนำ</h2>
                    <p className="mt-1 text-xs text-slate-500">Rule-based matching เท่านั้น · ทีมงานเป็นผู้ตัดสินใจส่งข้อมูล</p>
                  </div>
                  <span className="text-xs text-slate-500">{buyerMatches.length} แปลง</span>
                </div>
                {buyerMatches.length === 0 ? (
                  <p className="text-sm text-slate-500">ยังไม่มี Requirement เพียงพอสำหรับจับคู่ หรือยังไม่มีแปลงที่เข้าเงื่อนไข</p>
                ) : (
                  <div className="space-y-3">
                    {buyerMatches.map(({ land, score, reasons }) => {
                      const presentation = resolveListingPresentation(land);
                      const href = presentation.hrefOverride ?? listingHref(land.public_ref, land.slug);
                      return (
                        <article key={land.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="font-semibold text-slate-900">{land.title_th}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {land.province?.name_th ?? "ไม่ระบุจังหวัด"} · {land.size_rai.toLocaleString("th-TH")} ไร่ · {land.total_price === null ? "ไม่ระบุราคารวม" : formatMoneyFull(Number(land.total_price))}
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">Match {score}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {reasons.map((reason) => (
                              <span key={reason} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{reason}</span>
                            ))}
                          </div>
                          <Link href={href} target="_blank" className="mt-3 inline-flex text-sm font-semibold text-brand-600 hover:underline">
                            เปิดหน้าที่ดิน →
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">Activity Timeline</h2>
                <span className="text-xs text-slate-500">{activities.length} รายการล่าสุด</span>
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-slate-500">ยังไม่มีบันทึกการติดตาม</p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <article key={activity.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                          {ACTIVITY_LABELS[activity.activity_type]}
                        </span>
                        <time className="text-xs text-slate-500">{formatThaiDate(activity.created_at)}</time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{activity.note}</p>
                      {activity.created_by && <p className="mt-2 text-xs text-slate-400">โดย {activity.created_by}</p>}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
