import type { ListingStatus, PropertySubmission, SubmissionStatus } from "@/lib/types/database";

// Admin review lifecycle on property_submissions (existing status column):
// draft -> pending_review -> approved -> published -> sold -> expired ("archived").
// Nothing here hard-deletes; sold and archived rows keep their linked land record.
export const ADMIN_ACTIONS = {
  approve: { from: ["pending_review"], to: "approved" },
  reject: { from: ["pending_review", "approved"], to: "rejected" },
  publish: { from: ["approved"], to: "published" },
  sold: { from: ["published"], to: "sold" },
  archive: { from: ["published", "sold"], to: "expired" },
  relist: { from: ["sold", "expired"], to: "published" },
} as const satisfies Record<string, { from: readonly SubmissionStatus[]; to: SubmissionStatus }>;

export type AdminAction = keyof typeof ADMIN_ACTIONS;

export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
  approve: "อนุมัติ",
  reject: "ปฏิเสธ",
  publish: "เผยแพร่",
  sold: "ทำเครื่องหมายขายแล้ว",
  archive: "เก็บถาวร",
  relist: "เปิดขายอีกครั้ง",
};

/** Public lands.status that mirrors each post-publish submission status. */
export const LAND_STATUS_FOR_SUBMISSION: Partial<Record<SubmissionStatus, ListingStatus>> = {
  published: "active",
  sold: "sold",
  expired: "archived",
};

export function allowedAdminActions(status: SubmissionStatus): AdminAction[] {
  return (Object.keys(ADMIN_ACTIONS) as AdminAction[]).filter((action) =>
    (ADMIN_ACTIONS[action].from as readonly SubmissionStatus[]).includes(status),
  );
}

export function canApplyAdminAction(status: SubmissionStatus, action: AdminAction): boolean {
  return allowedAdminActions(status).includes(action);
}

// Generous Thailand bounding box; rejects swapped lat/lng and 0,0 placeholders.
const THAILAND_BOUNDS = { south: 5.5, north: 20.6, west: 97.3, east: 105.7 };

export function coordinateIssues(input: {
  lat: number | null;
  lng: number | null;
  location_precision?: string | null;
}): string[] {
  const hasLat = input.lat != null;
  const hasLng = input.lng != null;
  if (hasLat !== hasLng) return ["พิกัดไม่ครบ (ต้องมีทั้งละติจูดและลองจิจูด)"];
  if (!hasLat) {
    return input.location_precision === "exact" ? ["ระบุพิกัดแน่นอนแต่ไม่มีค่าพิกัด"] : [];
  }
  const lat = input.lat!;
  const lng = input.lng!;
  if (lat < THAILAND_BOUNDS.south || lat > THAILAND_BOUNDS.north || lng < THAILAND_BOUNDS.west || lng > THAILAND_BOUNDS.east) {
    return ["พิกัดอยู่นอกประเทศไทย"];
  }
  return [];
}

/** Land area (rai) or building usable area (sq.m.) — whichever applies to the asset — must be positive. */
export function hasPositiveArea(input: { total_rai: number | null; usable_area_sqm?: number | null }): boolean {
  return (input.total_rai != null && input.total_rai > 0) || (input.usable_area_sqm != null && input.usable_area_sqm > 0);
}

/** Fields a submission must have before an admin can publish it as a public sale listing. */
export function publishReadinessIssues(submission: PropertySubmission): string[] {
  const issues: string[] = [];
  if (submission.status !== "approved") issues.push("ต้องอนุมัติก่อนเผยแพร่");
  if (submission.transaction_type !== "sale") issues.push("รองรับเฉพาะประกาศขาย");
  if (!submission.property_type) issues.push("ประเภททรัพย์");
  if (!submission.title?.trim()) issues.push("ชื่อทรัพย์");
  if (!submission.province_id) issues.push("จังหวัด");
  if (!hasPositiveArea(submission)) issues.push("ขนาดพื้นที่");
  // The schema has no "price on request" flag, so a positive sale price is mandatory.
  if (submission.sale_price == null || submission.sale_price <= 0) issues.push("ราคาขาย");
  issues.push(...coordinateIssues(submission));
  return issues;
}
