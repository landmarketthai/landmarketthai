import { z } from "zod";
import type { DealStage, DealStatus, LeadStatus, LeadType } from "@/lib/types/database";
import { DEAL_STAGES, DEAL_STATUSES, LEAD_STATUSES, LEAD_TYPES } from "@/lib/operations/rules";

type Tuple<T extends string> = [T, ...T[]];
const leadStatus = z.enum(LEAD_STATUSES as Tuple<LeadStatus>);
const dealStage = z.enum(DEAL_STAGES as Tuple<DealStage>);
const dealStatus = z.enum(DEAL_STATUSES as Tuple<DealStatus>);
const isoDateTime = z.string().datetime({ offset: true });
const owner = z.string().trim().max(120).transform((value) => value || null).nullable();
const money = z.number().nonnegative().max(1e14).nullable();
const hasChange = (value: Record<string, unknown>) => Object.keys(value).some((key) => key !== "expected_updated_at" && value[key] !== undefined);

export const uuidSchema = z.string().uuid();

export const leadUpdateSchema = z.object({
  expected_updated_at: isoDateTime,
  status: leadStatus.optional(),
  reopen: z.literal(true).optional(),
  assigned_to: owner.optional(),
  next_action_at: isoDateTime.nullable().optional(),
  note: z.string().trim().min(1).max(2000).optional(),
}).strict().refine(hasChange, { message: "ไม่มีข้อมูลที่ต้องบันทึก" });
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

export const leadFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  lead_type: z.enum(LEAD_TYPES as Tuple<LeadType>).optional(),
  status: leadStatus.optional(),
  assigned_to: z.string().trim().max(120).optional(),
  overdue: z.literal("1").optional(),
  sort: z.enum(["newest", "next_action"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const dealFiltersSchema = z.object({
  assigned_to: z.string().trim().max(120).optional(),
  status: dealStatus.optional(),
});
export type DealFilters = z.infer<typeof dealFiltersSchema>;

export const dealCreateSchema = z.object({
  buyer_lead_id: uuidSchema,
  land_id: uuidSchema.optional(),
  listing_ref: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  deal_value: money.optional(),
  expected_commission: money.optional(),
  assigned_to: owner.optional(),
  notes: z.string().trim().max(4000).optional(),
}).strict().refine((value) => Boolean(value.land_id || value.listing_ref || value.title), {
  path: ["land_id"], message: "ระบุทรัพย์ (land_id) หรือรหัส/ชื่อประกาศ",
});
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const dealUpdateSchema = z.object({
  expected_updated_at: isoDateTime,
  stage: dealStage.optional(),
  status: dealStatus.optional(),
  deal_value: money.optional(),
  expected_commission: money.optional(),
  assigned_to: owner.optional(),
  notes: z.string().trim().max(4000).transform((value) => value || null).nullable().optional(),
}).strict().refine(hasChange, { message: "ไม่มีข้อมูลที่ต้องบันทึก" });
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

/** Next searchParams are string | string[]; keep the first non-empty value of each key (empty = no filter). */
export function firstParams(params: Record<string, string | string[] | undefined> | URLSearchParams): Record<string, string> {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first.trim() && !(key in out)) out[key] = first;
  }
  return out;
}
