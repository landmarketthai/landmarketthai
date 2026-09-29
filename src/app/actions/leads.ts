"use server";

import {
  insertLead,
  insertReferralAttribution,
  resolveActivePartner,
} from "@/lib/neon/mutations";
import {
  buyerLeadSchema,
  normalizePhone,
  ownerLeadSchema,
  partnerLeadSchema,
} from "@/lib/validations";

export type LeadActionState =
  | { status: "idle" }
  | { status: "success"; id: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

function str(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(formData: FormData, field: string): number | undefined {
  const value = formData.get(field);
  if (!value || typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toFieldErrors(
  error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } },
): Record<string, string[]> {
  const flat = error.flatten().fieldErrors;
  const output: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value) output[key] = value;
  }
  return output;
}

async function fireWebhook(leadId: string, leadType: string, name: string): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_LEADS;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, lead_type: leadType, name }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[n8n] webhook failed lead_id=${leadId} lead_type=${leadType} status=${response.status} body=${body}`,
      );
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    if (isTimeout) {
      console.error(`[n8n] webhook timed out lead_id=${leadId} lead_type=${leadType}`);
    } else {
      console.error(`[n8n] webhook error lead_id=${leadId} lead_type=${leadType}`, error);
    }
  }
}

async function resolveReferralCode(
  rawCode: string | undefined,
): Promise<{ validatedCode: string | null; partnerId: string | null }> {
  if (!rawCode) return { validatedCode: null, partnerId: null };

  const partnerId = await resolveActivePartner(rawCode);
  return partnerId
    ? { validatedCode: rawCode, partnerId }
    : { validatedCode: null, partnerId: null };
}

async function safeInsertAttribution(input: {
  leadId: string;
  leadType: "buyer" | "owner";
  referralCode: string;
  partnerId: string;
}): Promise<void> {
  try {
    await insertReferralAttribution({
      leadId: input.leadId,
      referralCode: input.referralCode,
      partnerId: input.partnerId,
      entityType: input.leadType,
    });
  } catch (error) {
    console.error(
      `[attribution] insert failed lead_id=${input.leadId} lead_type=${input.leadType} referral_code=${input.referralCode} partner_id=${input.partnerId}`,
      error,
    );
  }
}

export async function submitPartnerLead(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const raw = {
    name: str(formData, "name") ?? "",
    phone: normalizePhone(str(formData, "phone") ?? ""),
    line_id: str(formData, "line_id"),
    working_area: str(formData, "working_area"),
    experience: str(formData, "experience"),
    network_size: str(formData, "network_size"),
    referral_code: str(formData, "referral_code"),
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: str(formData, "source"),
  };

  const result = partnerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  try {
    const { validatedCode } = await resolveReferralCode(result.data.referral_code);
    const details: Record<string, unknown> = {
      working_area: result.data.working_area,
      experience: result.data.experience,
      network_size: result.data.network_size,
    };

    if (!validatedCode && result.data.referral_code) {
      details.raw_referral_code = result.data.referral_code;
    }

    const leadId = await insertLead({
      leadType: "partner",
      name: result.data.name,
      phone: result.data.phone,
      lineId: result.data.line_id ?? null,
      referralCode: validatedCode,
      source: result.data.source ?? null,
      details,
      consentPdpa: result.data.consent_pdpa,
      consentAt: new Date().toISOString(),
    });

    await fireWebhook(leadId, "partner", result.data.name);
    return { status: "success", id: leadId };
  } catch (error) {
    console.error("Partner lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function submitOwnerLead(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const raw = {
    name: str(formData, "name") ?? "",
    phone: normalizePhone(str(formData, "phone") ?? ""),
    line_id: str(formData, "line_id"),
    province: str(formData, "province") ?? "",
    district: str(formData, "district"),
    size_rai: num(formData, "size_rai"),
    asking_price: num(formData, "asking_price"),
    deed_type: str(formData, "deed_type"),
    notes: str(formData, "notes"),
    referral_code: str(formData, "referral_code"),
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: str(formData, "source"),
  };

  const result = ownerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  try {
    const { validatedCode, partnerId } = await resolveReferralCode(result.data.referral_code);
    const details: Record<string, unknown> = {
      province: result.data.province,
      district: result.data.district,
      size_rai: result.data.size_rai,
      asking_price: result.data.asking_price,
      deed_type: result.data.deed_type,
      notes: result.data.notes,
    };

    if (!validatedCode && result.data.referral_code) {
      details.raw_referral_code = result.data.referral_code;
    }

    const leadId = await insertLead({
      leadType: "owner",
      name: result.data.name,
      phone: result.data.phone,
      lineId: result.data.line_id ?? null,
      referralCode: validatedCode,
      source: result.data.source ?? null,
      details,
      consentPdpa: result.data.consent_pdpa,
      consentAt: new Date().toISOString(),
    });

    if (validatedCode && partnerId) {
      await safeInsertAttribution({
        leadId,
        leadType: "owner",
        referralCode: validatedCode,
        partnerId,
      });
    }

    await fireWebhook(leadId, "owner", result.data.name);
    return { status: "success", id: leadId };
  } catch (error) {
    console.error("Owner lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function submitBuyerLead(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const raw = {
    name: str(formData, "name") ?? "",
    phone: normalizePhone(str(formData, "phone") ?? ""),
    line_id: str(formData, "line_id"),
    province: str(formData, "province"),
    land_type: str(formData, "land_type"),
    budget_min: num(formData, "budget_min"),
    budget_max: num(formData, "budget_max"),
    notes: str(formData, "notes"),
    listing_id: str(formData, "listing_id"),
    referral_code: str(formData, "referral_code"),
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: str(formData, "source"),
  };

  const result = buyerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  try {
    const { validatedCode, partnerId } = await resolveReferralCode(result.data.referral_code);
    const details: Record<string, unknown> = {
      province: result.data.province,
      land_type: result.data.land_type,
      budget_min: result.data.budget_min,
      budget_max: result.data.budget_max,
      notes: result.data.notes,
      listing_id: result.data.listing_id,
    };

    if (!validatedCode && result.data.referral_code) {
      details.raw_referral_code = result.data.referral_code;
    }

    const leadId = await insertLead({
      leadType: "buyer",
      name: result.data.name,
      phone: result.data.phone,
      lineId: result.data.line_id ?? null,
      referralCode: validatedCode,
      source: result.data.source ?? null,
      details,
      consentPdpa: result.data.consent_pdpa,
      consentAt: new Date().toISOString(),
    });

    if (validatedCode && partnerId) {
      await safeInsertAttribution({
        leadId,
        leadType: "buyer",
        referralCode: validatedCode,
        partnerId,
      });
    }

    await fireWebhook(leadId, "buyer", result.data.name);
    return { status: "success", id: leadId };
  } catch (error) {
    console.error("Buyer lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }
}
