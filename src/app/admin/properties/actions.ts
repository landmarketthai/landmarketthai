"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { sendCrmEvent } from "@/lib/crm-webhook";
import { createServerClient } from "@/lib/supabase/server";
import type { LandType, ListingStatus, ZoningColor } from "@/lib/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAND_TYPES: readonly LandType[] = ["industrial", "eec", "factory", "warehouse", "logistics", "data_center", "investment"];
const ZONINGS: readonly ZoningColor[] = ["purple", "purple_light", "brown", "orange", "yellow", "green", "other"];
const STATUSES: readonly ListingStatus[] = ["draft", "active", "reserved", "sold", "archived"];

function requiredUuid(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`Invalid ${key}`);
  return value;
}

function requiredText(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  if (typeof value !== "string") throw new Error(`Invalid ${key}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`Invalid ${key}`);
  return trimmed;
}

function optionalText(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new Error(`${key} too long`);
  return trimmed;
}

function positiveNumber(formData: FormData, key: string, max = 1_000_000_000_000) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${key}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) throw new Error(`Invalid ${key}`);
  return parsed;
}

function optionalMoney(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Invalid ${key}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000_000) throw new Error(`Invalid ${key}`);
  return parsed;
}

function landType(formData: FormData): LandType {
  const value = formData.get("land_type");
  if (typeof value !== "string" || !LAND_TYPES.includes(value as LandType)) throw new Error("Invalid land type");
  return value as LandType;
}

function zoning(formData: FormData): ZoningColor | null {
  const value = formData.get("zoning");
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !ZONINGS.includes(value as ZoningColor)) throw new Error("Invalid zoning");
  return value as ZoningColor;
}

export async function createDraftLandFromOwnerLead(formData: FormData) {
  const admin = await requireAdmin("/admin/properties");
  const leadId = requiredUuid(formData, "lead_id");
  const provinceId = requiredUuid(formData, "province_id");
  const title = requiredText(formData, "title_th", 250);
  const slug = requiredText(formData, "slug", 150).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug must contain lowercase English letters, numbers and hyphens only");
  const district = optionalText(formData, "district", 200);
  const sizeRai = positiveNumber(formData, "size_rai", 100_000);
  const pricePerRai = positiveNumber(formData, "price_per_rai");
  const reward = optionalMoney(formData, "referral_reward_max");
  const type = landType(formData);
  const zone = zoning(formData);
  const isEec = formData.get("is_eec") === "on";

  const db = createServerClient();
  const { data: draftRows, error } = await db.rpc("create_property_draft_from_owner_lead", {
    p_lead_id: leadId,
    p_province_id: provinceId,
    p_title: title,
    p_slug: slug,
    p_district: district,
    p_land_type: type,
    p_size_rai: sizeRai,
    p_zoning: zone,
    p_price_per_rai: pricePerRai,
    p_referral_reward_max: reward,
    p_is_eec: isEec,
    p_created_by: admin.email ?? null,
  });
  if (error) throw new Error(`Create property draft failed: ${error.message}`);

  const draftResult = Array.isArray(draftRows) ? draftRows[0] : draftRows;
  const landId = draftResult?.land_id as string | undefined;
  const created = Boolean(draftResult?.created);
  if (!landId) throw new Error("Create property draft failed: no land id returned");
  if (!created) redirect(`/admin/properties/${landId}`);

  await sendCrmEvent("property_draft_created", { land_id: landId, owner_lead_id: leadId, slug });

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${landId}`);
}

export async function updateProperty(formData: FormData) {
  await requireAdmin("/admin/properties");
  const landId = requiredUuid(formData, "land_id");
  const provinceId = requiredUuid(formData, "province_id");
  const title = requiredText(formData, "title_th", 250);
  const slug = requiredText(formData, "slug", 150).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid slug");
  const district = optionalText(formData, "district", 200);
  const sizeRai = positiveNumber(formData, "size_rai", 100_000);
  const pricePerRai = positiveNumber(formData, "price_per_rai");
  const reward = optionalMoney(formData, "referral_reward_max");
  const type = landType(formData);
  const zone = zoning(formData);
  const isEec = formData.get("is_eec") === "on";
  const statusValue = formData.get("status");
  if (typeof statusValue !== "string" || !STATUSES.includes(statusValue as ListingStatus)) throw new Error("Invalid listing status");
  const status = statusValue as ListingStatus;

  const db = createServerClient();
  const now = new Date().toISOString();
  const { error } = await db.from("lands").update({
    title_th: title,
    slug,
    province_id: provinceId,
    district,
    land_type: type,
    size_rai: sizeRai,
    zoning: zone,
    price_per_rai: pricePerRai,
    referral_reward_max: reward,
    is_eec: isEec,
    status,
    updated_at: now,
  }).eq("id", landId);
  if (error) throw new Error(`Update property failed: ${error.message}`);

  await sendCrmEvent("property_changed", { land_id: landId, status, slug });
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${landId}`);
  revalidatePath("/land");
}
