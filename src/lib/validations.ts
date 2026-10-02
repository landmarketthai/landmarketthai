import { z } from "zod";
import { LAND_CATEGORY_TYPES, ZONING_LABELS } from "@/lib/utils";
import { PROPERTY_TYPES } from "@/lib/marketplace/presentation";
import { LOCATION_ANCHORS } from "@/lib/location-intelligence";

export const buyerRequirementsSchema = z.object({
  province: z.string().trim().min(1).max(80).optional(),
  land_type: z.enum(LAND_CATEGORY_TYPES).optional(),
  property_type: z.enum(PROPERTY_TYPES).optional(),
  min_usable_area_sqm: z.number().finite().nonnegative().max(9_999_999_999.99).multipleOf(0.01).optional(),
  max_usable_area_sqm: z.number().finite().nonnegative().max(9_999_999_999.99).multipleOf(0.01).optional(),
  size_min_rai: z.number().nonnegative().max(1e12).optional(),
  size_max_rai: z.number().nonnegative().max(1e12).optional(),
  budget_min: z.number().nonnegative().max(1e12).optional(),
  budget_max: z.number().nonnegative().max(1e12).optional(),
  zoning: z.enum(Object.keys(ZONING_LABELS) as [string, ...string[]]).optional(),
  is_eec: z.boolean().optional(),
  frontage_min_m: z.number().nonnegative().max(1e12).optional(),
  anchor_id: z.enum(LOCATION_ANCHORS.map(anchor => anchor.id) as [string, ...string[]]).optional(),
  distance_max_km: z.number().nonnegative().max(1e12).optional(),
  intended_use: z.string().trim().max(500).optional(),
  listing_id: z.string().trim().min(1).max(200).optional(),
}).superRefine((value, context) => {
  for (const [min, max] of [["size_min_rai", "size_max_rai"], ["budget_min", "budget_max"], ["min_usable_area_sqm", "max_usable_area_sqm"]] as const) {
    if (value[min] !== undefined && value[max] !== undefined && value[min] > value[max]) {
      context.addIssue({ code: "custom", path: [max], message: "ค่าสูงสุดต้องไม่น้อยกว่าค่าต่ำสุด" });
    }
  }
  if ((value.anchor_id === undefined) !== (value.distance_max_km === undefined)) {
    context.addIssue({ code: "custom", path: ["distance_max_km"], message: "ระบุจุดอ้างอิงและระยะทางร่วมกัน" });
  }
});

export type BuyerRequirements = z.infer<typeof buyerRequirementsSchema>;

const thaiPhone = z
  .string()
  .regex(/^0[0-9]{8,9}$/, "กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 0812345678)");

// In Zod v4, z.literal(true) takes the value only; use .refine for a custom message
const consentPdpa = z
  .boolean()
  .refine((v) => v === true, "กรุณายอมรับนโยบายความเป็นส่วนตัว");

export const buyerLeadSchema = buyerRequirementsSchema.safeExtend({
  name: z.string().min(2, "กรุณากรอกชื่อ"),
  phone: thaiPhone,
  line_id: z.string().optional(),
  notes: z.string().optional(),
  referral_code: z.string().optional(),
  consent_pdpa: consentPdpa,
  source: z.string().optional(),
});

export const partnerLeadSchema = z.object({
  name: z.string().min(2, "กรุณากรอกชื่อ"),
  phone: thaiPhone,
  line_id: z.string().optional(),
  working_area: z.string().optional(),
  experience: z.string().optional(),
  network_size: z.string().optional(),
  referral_code: z.string().optional(),
  consent_pdpa: consentPdpa,
  source: z.string().optional(),
});

export const ownerLeadSchema = z.object({
  name: z.string().min(2, "กรุณากรอกชื่อ"),
  phone: thaiPhone,
  line_id: z.string().optional(),
  province: z.string().min(1, "กรุณาเลือกจังหวัด"),
  district: z.string().optional(),
  size_rai: z.number().positive("กรุณากรอกพื้นที่"),
  asking_price: z.number().positive().optional(),
  deed_type: z.string().optional(),
  notes: z.string().optional(),
  referral_code: z.string().optional(),
  consent_pdpa: consentPdpa,
  source: z.string().optional(),
});

export const presignSchema = z.object({
  leadId: z.string().uuid(),
  mimeType: z.string().min(1),
  fileSize: z.number().positive().max(20 * 1024 * 1024),
  originalName: z.string().min(1),
});

export const uploadConfirmSchema = z.object({
  storageKey: z.string().min(1),
  leadId: z.string().uuid(),
  docType: z.enum(["title_deed", "map", "brochure", "other"]).optional(),
  mimeType: z.string().min(1),
  fileSize: z.number().positive(),
  originalName: z.string().min(1),
});

export type BuyerLeadInput = z.infer<typeof buyerLeadSchema>;
export type PartnerLeadInput = z.infer<typeof partnerLeadSchema>;
export type OwnerLeadInput = z.infer<typeof ownerLeadSchema>;

/**
 * Strips common formatting characters and normalises the +66 country-code prefix
 * so users can type 081-234-5678 or +6681234567 and still pass the regex.
 */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, "");
  if (p.startsWith("+66")) p = "0" + p.slice(3);
  else if (/^66\d{9}$/.test(p)) p = "0" + p.slice(2);
  return p;
}
