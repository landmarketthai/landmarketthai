"use server";

import { cookies } from "next/headers";
import { ATTRIBUTION_SOURCE_COOKIE, REFERRAL_COOKIE } from "@/lib/lead-attribution";
import { createServerClient } from "@/lib/supabase/server";
import { partnerLeadSchema, ownerLeadSchema, buyerLeadSchema, normalizePhone } from "@/lib/validations";

export type LeadActionState =
  | { status: "idle" }
  | { status: "success"; id: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

function str(formData: FormData, field: string): string | undefined {
  const v = formData.get(field);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(formData: FormData, field: string): number | undefined {
  const v = formData.get(field);
  if (!v || typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

async function attributionInput(formData: FormData) {
  const cookieStore = await cookies();
  return {
    referral_code: cookieStore.get(REFERRAL_COOKIE)?.value ?? str(formData, "referral_code"),
    source: cookieStore.get(ATTRIBUTION_SOURCE_COOKIE)?.value ?? str(formData, "source"),
  };
}

function toFieldErrors(
  error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }
): Record<string, string[]> {
  const flat = error.flatten().fieldErrors;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v) out[k] = v;
  }
  return out;
}

async function fireWebhook(leadId: string, leadType: string, name: string): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_LEADS;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, lead_type: leadType, name }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[n8n] webhook failed lead_id=${leadId} lead_type=${leadType} status=${res.status} body=${text}`
      );
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    if (isTimeout) {
      console.error(`[n8n] webhook timed out lead_id=${leadId} lead_type=${leadType}`);
    } else {
      console.error(`[n8n] webhook error lead_id=${leadId} lead_type=${leadType}`, err);
    }
  }
}

type SupabaseClient = ReturnType<typeof createServerClient>;

async function resolveActivePartner(
  db: SupabaseClient,
  referralCode: string
): Promise<string | null> {
  const { data } = await db
    .from("partners")
    .select("id")
    .eq("referral_code", referralCode)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

async function insertAttribution(
  db: SupabaseClient,
  leadId: string,
  leadType: string,
  referralCode: string,
  partnerId: string,
  entityType: "buyer" | "owner"
): Promise<void> {
  const { error } = await db.from("referral_attributions").insert({
    referral_code: referralCode,
    lead_id: leadId,
    partner_id: partnerId,
    entity_type: entityType,
    first_touch_at: new Date().toISOString(),
  });
  if (error) {
    console.error(
      `[attribution] insert failed lead_id=${leadId} lead_type=${leadType} referral_code=${referralCode} partner_id=${partnerId} error=${error.message}`
    );
  }
}

/**
 * Resolves a client-supplied referral_code against active partners before any DB write.
 * Returns { validatedCode, partnerId } — both null when the code does not resolve.
 * Callers must write the raw code into details.raw_referral_code if partnerId is null.
 */
async function resolveReferralCode(
  db: SupabaseClient,
  rawCode: string | undefined
): Promise<{ validatedCode: string | null; partnerId: string | null }> {
  if (!rawCode) return { validatedCode: null, partnerId: null };
  const partnerId = await resolveActivePartner(db, rawCode);
  if (partnerId) return { validatedCode: rawCode, partnerId };
  return { validatedCode: null, partnerId: null };
}

export async function submitPartnerLead(
  _prev: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const attribution = await attributionInput(formData);
  const raw = {
    name: str(formData, "name") ?? "",
    phone: normalizePhone(str(formData, "phone") ?? ""),
    line_id: str(formData, "line_id"),
    working_area: str(formData, "working_area"),
    experience: str(formData, "experience"),
    network_size: str(formData, "network_size"),
    referral_code: attribution.referral_code,
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: attribution.source,
  };

  const result = partnerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  const db = createServerClient();

  // Resolve once before insert. Partners never create referral_attributions — they are
  // the attributors, not the attributees — so resolvedPartnerId is intentionally unused.
  const { validatedCode } = await resolveReferralCode(db, result.data.referral_code);

  const details: Record<string, unknown> = {
    working_area: result.data.working_area,
    experience: result.data.experience,
    network_size: result.data.network_size,
  };
  if (!validatedCode && result.data.referral_code) {
    details.raw_referral_code = result.data.referral_code;
  }

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      lead_type: "partner",
      name: result.data.name,
      phone: result.data.phone,
      line_id: result.data.line_id ?? null,
      referral_code: validatedCode,
      source: result.data.source ?? null,
      details,
      consent_pdpa: result.data.consent_pdpa,
      consent_at: new Date().toISOString(),
      status: "new",
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("Partner lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }

  await fireWebhook(lead.id, "partner", result.data.name);

  return { status: "success", id: lead.id };
}

export async function submitOwnerLead(
  _prev: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const attribution = await attributionInput(formData);
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
    referral_code: attribution.referral_code,
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: attribution.source,
  };

  const result = ownerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  const db = createServerClient();

  // Resolve once before insert to validate the code and obtain partnerId for attribution.
  const { validatedCode, partnerId } = await resolveReferralCode(db, result.data.referral_code);

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

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      lead_type: "owner",
      name: result.data.name,
      phone: result.data.phone,
      line_id: result.data.line_id ?? null,
      referral_code: validatedCode,
      source: result.data.source ?? null,
      details,
      consent_pdpa: result.data.consent_pdpa,
      consent_at: new Date().toISOString(),
      status: "new",
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("Owner lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }

  // Use the already-resolved partnerId — no second resolveActivePartner call.
  if (validatedCode && partnerId) {
    await insertAttribution(db, lead.id, "owner", validatedCode, partnerId, "owner");
  }

  await fireWebhook(lead.id, "owner", result.data.name);

  return { status: "success", id: lead.id };
}

export async function submitBuyerLead(
  _prev: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  if (formData.get("_hp")) return { status: "success", id: "" };

  const attribution = await attributionInput(formData);
  const raw = {
    name: str(formData, "name") ?? "",
    phone: normalizePhone(str(formData, "phone") ?? ""),
    line_id: str(formData, "line_id"),
    province: str(formData, "province"),
    land_type: str(formData, "land_type"),
    size_min_rai: num(formData, "size_min_rai"),
    size_max_rai: num(formData, "size_max_rai"),
    budget_min: num(formData, "budget_min"),
    budget_max: num(formData, "budget_max"),
    notes: str(formData, "notes"),
    listing_id: str(formData, "listing_id"),
    referral_code: attribution.referral_code,
    consent_pdpa: formData.get("consent_pdpa") === "on",
    source: attribution.source,
  };

  const result = buyerLeadSchema.safeParse(raw);
  if (!result.success) {
    return {
      status: "error",
      message: "กรุณาตรวจสอบข้อมูลให้ครบถ้วน",
      fieldErrors: toFieldErrors(result.error),
    };
  }

  const db = createServerClient();

  // Resolve once before insert to validate the code and obtain partnerId for attribution.
  const { validatedCode, partnerId } = await resolveReferralCode(db, result.data.referral_code);

  const details: Record<string, unknown> = {
    province: result.data.province,
    land_type: result.data.land_type,
    size_min_rai: result.data.size_min_rai,
    size_max_rai: result.data.size_max_rai,
    budget_min: result.data.budget_min,
    budget_max: result.data.budget_max,
    notes: result.data.notes,
    listing_id: result.data.listing_id,
  };
  if (!validatedCode && result.data.referral_code) {
    details.raw_referral_code = result.data.referral_code;
  }

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      lead_type: "buyer",
      name: result.data.name,
      phone: result.data.phone,
      line_id: result.data.line_id ?? null,
      referral_code: validatedCode,
      source: result.data.source ?? null,
      details,
      consent_pdpa: result.data.consent_pdpa,
      consent_at: new Date().toISOString(),
      status: "new",
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("Buyer lead insert error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  }

  // Use the already-resolved partnerId — no second resolveActivePartner call.
  if (validatedCode && partnerId) {
    await insertAttribution(db, lead.id, "buyer", validatedCode, partnerId, "buyer");
  }

  await fireWebhook(lead.id, "buyer", result.data.name);

  return { status: "success", id: lead.id };
}
