import { z } from "zod";
import { normalizePhone } from "@/lib/validations";
import { PROPERTY_TYPES } from "@/lib/marketplace/presentation";

const optionalNumber = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.coerce.number().finite().nonnegative().nullable(),
);

const optionalUuid = z.preprocess(
  (value) => value === "" ? null : value,
  z.string().uuid().nullable(),
);

const thaiPhone = z.string().trim().transform(normalizePhone).pipe(
  z.string().regex(/^0[0-9]{8,9}$/, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง"),
);
const optionalThaiPhone = z.string().trim().max(32).transform(normalizePhone).refine(
  (value) => value === "" || /^0[0-9]{8,9}$/.test(value),
  "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง",
);

export const draftSchema = z.object({
  token: z.string().uuid(),
  property_type: z.enum(PROPERTY_TYPES).nullable().optional(),
  transaction_type: z.literal("sale").nullable().optional(),
  title: z.string().trim().max(180).nullable().optional(),
  province_id: optionalUuid.optional(),
  district: z.string().trim().max(120).nullable().optional(),
  subdistrict: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  area_rai: z.coerce.number().int().nonnegative().nullable().optional(),
  area_ngan: z.coerce.number().int().min(0).max(3).nullable().optional(),
  area_sqwa: z.coerce.number().min(0).lt(100).nullable().optional(),
  usable_area_sqm: z.coerce.number().finite().nonnegative().max(9_999_999_999.99).nullable().optional(),
  frontage_m: optionalNumber.optional(),
  depth_min_m: optionalNumber.optional(),
  depth_max_m: optionalNumber.optional(),
  road_name: z.string().trim().max(160).nullable().optional(),
  road_width_m: optionalNumber.optional(),
  zoning: z.enum(["purple", "purple_light", "brown", "orange", "yellow", "green", "other"]).nullable().optional(),
  sale_price: optionalNumber.optional(),
  price_per_rai: optionalNumber.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_phone: optionalThaiPhone.nullable().optional(),
  contact_line: z.string().trim().max(100).nullable().optional(),
});

export const submitDraftSchema = z.object({
  token: z.string().uuid(),
  buyer_demand_slug: z.string().regex(/^buyer-demand-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  consent_pdpa: z.literal(true),
});

export const submissionUploadSchema = z.object({
  token: z.string().uuid(),
  media_kind: z.enum(["image", "document"]),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size_bytes: z.coerce.number().int().positive().max(20 * 1024 * 1024),
  doc_type: z.enum(["title_deed", "map", "brochure", "other"]).optional(),
});

export const buyerRequirementSchema = z.object({
  property_type: z.enum(PROPERTY_TYPES).nullable().optional(),
  transaction_type: z.literal("sale").default("sale"),
  preferred_locations: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  province_ids: z.array(z.string().uuid().toLowerCase()).max(10).default([]).refine(
    (ids) => new Set(ids).size === ids.length, "กรุณาเลือกจังหวัดไม่ซ้ำกัน",
  ),
  min_size_rai: z.number().finite().nonnegative().max(999_999_999.99999).multipleOf(0.00001).nullable().optional(),
  max_size_rai: z.number().finite().nonnegative().max(999_999_999.99999).multipleOf(0.00001).nullable().optional(),
  max_price: z.number().finite().nonnegative().max(99_999_999_999_999.99).multipleOf(0.01).nullable().optional(),
  max_price_per_rai: z.number().finite().nonnegative().max(99_999_999_999_999.99).multipleOf(0.01).nullable().optional(),
  zoning: z.enum(["purple", "purple_light", "brown", "orange", "yellow", "green", "other"]).nullable().optional(),
  purpose: z.string().trim().max(1000).nullable().optional(),
  container_access: z.boolean().nullable().optional(),
  high_voltage: z.boolean().nullable().optional(),
  water_requirement: z.string().trim().max(1000).nullable().optional(),
  special_requirements: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().max(32).pipe(thaiPhone),
  line_id: z.string().trim().max(100).nullable().optional(),
  consent_pdpa: z.literal(true),
  consent_public: z.boolean().default(false),
}).strict().refine((value) => value.max_size_rai == null || value.min_size_rai == null || value.min_size_rai <= value.max_size_rai, {
  message: "ช่วงขนาดไม่ถูกต้อง",
  path: ["max_size_rai"],
});

export type BuyerRequirementInput = z.infer<typeof buyerRequirementSchema>;
