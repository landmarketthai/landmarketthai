import type { Land, PropertySubmission } from "@/lib/types/database";
import { ZONING_LABELS, formatUpdatedDate } from "@/lib/utils";

// Each dimension only reports "ok" when a dedicated stored field actually backs the claim.
// The schema only has the generic listing review (verification_status). There are no
// owner-identity, document, location, zoning or price_updated_at verification fields, so
// those dimensions can never be "ok" and are never inferred from the listing review.
export type VerificationKey = "review" | "owner" | "document" | "location" | "zoning" | "price" | "recency";
export type VerificationState = "ok" | "partial" | "missing";

export interface VerificationDimension {
  key: VerificationKey;
  state: VerificationState;
  title: string;
  label: string;
}

export interface VerificationInput {
  verification_status: Land["verification_status"];
  lat: number | null;
  lng: number | null;
  location_precision: Land["location_precision"];
  zoning: Land["zoning"];
  price: number | null;
  updated_at: string;
  title_deed_on_file: boolean;
}

export const VERIFICATION_TITLES: Record<VerificationKey, string> = {
  review: "ทีมงานตรวจสอบประกาศ",
  owner: "ตัวตนเจ้าของ / ผู้ส่งข้อมูล",
  document: "เอกสารสิทธิ์",
  location: "ตำแหน่งแปลง",
  zoning: "ผังเมือง",
  price: "ราคา",
  recency: "ความใหม่ของข้อมูลประกาศ",
};

export const RECENT_UPDATE_DAYS = 30;

/** Only a literal stored review result counts; null/missing/unknown values are never treated as verified. */
export function normalizeVerificationStatus(value: unknown): Land["verification_status"] {
  return value === "verified" || value === "rejected" ? value : "pending";
}

export function verificationDimensions(input: VerificationInput, now: Date = new Date()): VerificationDimension[] {
  const reviewed = input.verification_status === "verified";
  const hasCoords = input.lat != null && input.lng != null;
  const updated = new Date(input.updated_at);
  const ageDays = Number.isNaN(updated.getTime()) ? null : (now.getTime() - updated.getTime()) / 86_400_000;
  const updatedLabel = formatUpdatedDate(input.updated_at);

  return [
    {
      key: "review",
      title: VERIFICATION_TITLES.review,
      state: reviewed ? "ok" : "missing",
      label: reviewed
        ? "ทีมงานตรวจสอบประกาศแล้ว (ไม่ใช่การรับรองทุกข้อมูล)"
        : input.verification_status === "rejected" ? "ประกาศไม่ผ่านการตรวจสอบ" : "รอทีมงานตรวจสอบประกาศ",
    },
    {
      key: "owner",
      title: VERIFICATION_TITLES.owner,
      state: "missing",
      label: "ยังไม่มีการยืนยันตัวตนเจ้าของในระบบ",
    },
    {
      key: "document",
      title: VERIFICATION_TITLES.document,
      // A stored title-deed copy is not a document check; no document-verification field exists yet.
      state: input.title_deed_on_file ? "partial" : "missing",
      label: input.title_deed_on_file ? "มีสำเนาโฉนดในระบบ — ยังไม่ได้บันทึกผลตรวจเอกสาร" : "ยังไม่มีสำเนาโฉนดในระบบ",
    },
    {
      key: "location",
      title: VERIFICATION_TITLES.location,
      // "exact" is coordinate precision, not a location check; no location-verification field exists yet.
      state: hasCoords ? "partial" : "missing",
      label: !hasCoords
        ? "ยังไม่มีพิกัด"
        : input.location_precision === "exact" ? "พิกัดแบบ Exact — ยังไม่ได้บันทึกผลตรวจตำแหน่ง" : "ตำแหน่งโดยประมาณ",
    },
    {
      key: "zoning",
      title: VERIFICATION_TITLES.zoning,
      state: input.zoning ? "partial" : "missing",
      label: input.zoning ? `${ZONING_LABELS[input.zoning]} (ตามข้อมูลประกาศ ยังไม่ได้ตรวจกับผังเมือง)` : "ยังไม่ระบุผังเมือง",
    },
    {
      key: "price",
      title: VERIFICATION_TITLES.price,
      // Price presence only; there is no price_updated_at, so nothing is claimed about price recency.
      state: input.price == null ? "missing" : "partial",
      label: input.price == null ? "ยังไม่ระบุราคา" : "มีราคาในประกาศ — ไม่มีบันทึกวันที่ปรับราคา",
    },
    {
      key: "recency",
      title: VERIFICATION_TITLES.recency,
      state: ageDays == null ? "missing" : ageDays <= RECENT_UPDATE_DAYS ? "ok" : "partial",
      label: updatedLabel ? `ข้อมูลประกาศอัปเดต ${updatedLabel}` : "ไม่ทราบวันที่อัปเดตข้อมูลประกาศ",
    },
  ];
}

export function landVerification(land: Land, now?: Date): VerificationDimension[] {
  return verificationDimensions({
    verification_status: land.verification_status,
    lat: land.lat,
    lng: land.lng,
    location_precision: land.location_precision,
    zoning: land.zoning,
    price: land.total_price,
    updated_at: land.updated_at,
    title_deed_on_file: Boolean(land.title_deed_on_file),
  }, now);
}

export function submissionVerification(submission: PropertySubmission, now?: Date): VerificationDimension[] {
  return verificationDimensions({
    verification_status: submission.verification_status,
    lat: submission.lat,
    lng: submission.lng,
    location_precision: submission.location_precision,
    zoning: submission.zoning,
    price: submission.sale_price,
    updated_at: submission.updated_at,
    title_deed_on_file: Boolean(submission.media?.some((media) => media.media_kind === "document" && media.doc_type === "title_deed")),
  }, now);
}

// Location precision is rendered separately (exact vs approximate chip) by the map/card UI.
// The recency badge describes listing data, never the price itself.
const SHORT_BADGES: Partial<Record<VerificationKey, string>> = {
  review: "ทีมงานตรวจสอบประกาศ",
  recency: `ข้อมูลอัปเดตใน ${RECENT_UPDATE_DAYS} วัน`,
};

/** Compact positive badges for cards / map previews. Only data-backed "ok" dimensions. */
export function verificationBadges(land: Land, now?: Date): string[] {
  return landVerification(land, now)
    .filter((dimension) => dimension.state === "ok" && SHORT_BADGES[dimension.key])
    .map((dimension) => SHORT_BADGES[dimension.key]!);
}
