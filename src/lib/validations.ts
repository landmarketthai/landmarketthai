import { z } from "zod";

const thaiPhone = z
  .string()
  .regex(/^0[0-9]{8,9}$/, "กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 0812345678)");

// In Zod v4, z.literal(true) takes the value only; use .refine for a custom message
const consentPdpa = z
  .boolean()
  .refine((v) => v === true, "กรุณายอมรับนโยบายความเป็นส่วนตัว");

export const buyerLeadSchema = z.object({
  name: z.string().min(2, "กรุณากรอกชื่อ"),
  phone: thaiPhone,
  line_id: z.string().optional(),
  province: z.string().max(100).optional(),
  land_type: z.enum(["industrial", "eec", "factory", "warehouse", "logistics", "data_center", "investment"]).optional(),
  size_min_rai: z.number().positive().max(100000).optional(),
  size_max_rai: z.number().positive().max(100000).optional(),
  budget_min: z.number().nonnegative().max(1_000_000_000_000).optional(),
  budget_max: z.number().nonnegative().max(1_000_000_000_000).optional(),
  notes: z.string().max(2000).optional(),
  listing_id: z.string().max(150).optional(),
  referral_code: z.string().optional(),
  consent_pdpa: consentPdpa,
  source: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.size_min_rai !== undefined && value.size_max_rai !== undefined && value.size_min_rai > value.size_max_rai) {
    ctx.addIssue({ code: "custom", path: ["size_max_rai"], message: "ขนาดสูงสุดต้องไม่น้อยกว่าขนาดเริ่มต้น" });
  }
  if (value.budget_min !== undefined && value.budget_max !== undefined && value.budget_min > value.budget_max) {
    ctx.addIssue({ code: "custom", path: ["budget_max"], message: "งบสูงสุดต้องไม่น้อยกว่างบเริ่มต้น" });
  }
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
