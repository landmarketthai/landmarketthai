"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { sendCrmEvent } from "@/lib/crm-webhook";
import { dealStageRequiresValue, dealStatusForStage } from "@/lib/deal-pipeline";
import { listingStatusForDealStages } from "@/lib/property-pipeline";
import { createServerClient } from "@/lib/supabase/server";
import type { CommissionStatus, DealStage } from "@/lib/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEAL_STAGES: readonly DealStage[] = [
  "qualified",
  "property_sent",
  "site_visit",
  "negotiation",
  "offer",
  "deposit",
  "won",
  "lost",
];
const COMMISSION_STATUSES: readonly CommissionStatus[] = ["estimated", "approved", "payable", "paid", "cancelled"];

function requiredUuid(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`Invalid ${key}`);
  return value;
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`Invalid ${key}`);
  return value;
}

function optionalText(formData: FormData, key: string, max: number): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new Error(`${key} too long`);
  return trimmed;
}

function optionalMoney(formData: FormData, key: string): number | null {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Invalid ${key}`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) throw new Error(`Invalid ${key}`);
  return amount;
}

async function addAuditNote(leadId: string | null, note: string, createdBy: string | null | undefined) {
  if (!leadId) return;
  const { error } = await createServerClient().from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "note",
    note,
    created_by: createdBy ?? null,
  });
  if (error) console.error(`Deal audit note failed lead_id=${leadId}:`, error.message);
}

async function resolveActivePartnerId(
  db: ReturnType<typeof createServerClient>,
  referralCode: string | null,
): Promise<string | null> {
  if (!referralCode) return null;
  const { data, error } = await db
    .from("partners")
    .select("id")
    .eq("referral_code", referralCode)
    .eq("status", "active")
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(`Resolve referral partner failed: ${error.message}`);
  return data?.id ?? null;
}

async function syncBuyerLeadStatus(db: ReturnType<typeof createServerClient>, leadId: string) {
  const { data, error } = await db
    .from("deals")
    .select("id,stage,updated_at")
    .eq("buyer_lead_id", leadId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Sync buyer lead failed: ${error.message}`);

  const deals = data ?? [];
  const wonDeal = deals.find((deal) => deal.stage === "won");
  const hasActive = deals.some((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const leadStatus = wonDeal ? "won" : hasActive || deals.length === 0 ? "qualified" : "lost";
  const now = new Date().toISOString();

  const { error: leadError } = await db.from("leads").update({ status: leadStatus, updated_at: now }).eq("id", leadId);
  if (leadError) throw new Error(`Sync lead status failed: ${leadError.message}`);

  const { error: attributionError } = await db
    .from("referral_attributions")
    .update({ converted: Boolean(wonDeal), deal_id: wonDeal?.id ?? null })
    .eq("lead_id", leadId);
  if (attributionError) console.error(`Sync attribution failed lead_id=${leadId}:`, attributionError.message);

  return leadStatus;
}

async function syncLandStatus(db: ReturnType<typeof createServerClient>, landId: string) {
  const [{ data: land, error: landError }, { data: deals, error: dealsError }] = await Promise.all([
    db.from("lands").select("status").eq("id", landId).maybeSingle(),
    db.from("deals").select("stage").eq("land_id", landId),
  ]);
  if (landError) throw new Error(`Sync land failed: ${landError.message}`);
  if (dealsError) throw new Error(`Sync land deals failed: ${dealsError.message}`);
  if (!land) return;

  const desired = listingStatusForDealStages(land.status, (deals ?? []).map((deal) => deal.stage as DealStage));
  if (desired === land.status) return;

  const { error } = await db.from("lands").update({ status: desired, updated_at: new Date().toISOString() }).eq("id", landId);
  if (error) throw new Error(`Update land status failed: ${error.message}`);
  revalidatePath("/land");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${landId}`);
}

export async function createDealFromLead(formData: FormData) {
  const admin = await requireAdmin();
  const leadId = requiredUuid(formData, "lead_id");
  const landId = optionalUuid(formData, "land_id");
  const listingRef = optionalText(formData, "listing_ref", 150);
  const listingTitle = optionalText(formData, "listing_title", 300);
  const expectedCommission = optionalMoney(formData, "expected_commission");

  if (!landId && !listingRef) throw new Error("A property reference is required");

  const db = createServerClient();
  const [{ data: lead, error: leadError }, { data: buyerAttribution, error: attributionError }] = await Promise.all([
    db.from("leads").select("id,lead_type,referral_code,assigned_to,status").eq("id", leadId).maybeSingle(),
    db.from("referral_attributions").select("partner_id,referral_code").eq("lead_id", leadId).limit(1).maybeSingle(),
  ]);

  if (leadError) throw new Error(`Load lead failed: ${leadError.message}`);
  if (!lead || lead.lead_type !== "buyer") throw new Error("Only buyer leads can open a deal");
  if (attributionError && attributionError.code !== "PGRST116") throw new Error(`Load attribution failed: ${attributionError.message}`);

  let ownerLeadId: string | null = null;
  let ownerReferralCode: string | null = null;
  let ownerPartnerId: string | null = null;
  if (landId) {
    const { data: land, error: landError } = await db.from("lands").select("owner_lead_id").eq("id", landId).maybeSingle();
    if (landError) throw new Error(`Load land owner source failed: ${landError.message}`);
    ownerLeadId = land?.owner_lead_id ?? null;
    if (ownerLeadId) {
      const [sourceResult, ownerLeadResult] = await Promise.all([
        db
          .from("referral_attributions")
          .select("partner_id,referral_code")
          .eq("lead_id", ownerLeadId)
          .limit(1)
          .maybeSingle(),
        db.from("leads").select("referral_code").eq("id", ownerLeadId).maybeSingle(),
      ]);
      if (sourceResult.error && sourceResult.error.code !== "PGRST116") {
        throw new Error(`Load owner attribution failed: ${sourceResult.error.message}`);
      }
      if (ownerLeadResult.error && ownerLeadResult.error.code !== "PGRST116") {
        throw new Error(`Load owner referral fallback failed: ${ownerLeadResult.error.message}`);
      }
      ownerReferralCode = sourceResult.data?.referral_code ?? ownerLeadResult.data?.referral_code ?? null;
      ownerPartnerId = sourceResult.data?.partner_id ?? await resolveActivePartnerId(db, ownerReferralCode);
    }
  }

  let duplicateQuery = db.from("deals").select("id").eq("buyer_lead_id", leadId);
  duplicateQuery = listingRef ? duplicateQuery.eq("listing_ref", listingRef) : duplicateQuery.eq("land_id", landId!);
  const { data: existingDeal, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
  if (duplicateError && duplicateError.code !== "PGRST116") throw new Error(`Check existing deal failed: ${duplicateError.message}`);
  if (existingDeal?.id) redirect(`/admin/deals/${existingDeal.id}`);

  const buyerReferralCode = buyerAttribution?.referral_code ?? lead.referral_code ?? null;
  const buyerPartnerId = buyerAttribution?.partner_id ?? await resolveActivePartnerId(db, buyerReferralCode);
  const referralSources = [
    ...(buyerReferralCode ? [{ source_lead_id: leadId, source_type: "buyer" as const, partner_id: buyerPartnerId, referral_code: buyerReferralCode }] : []),
    ...(ownerLeadId && ownerReferralCode
      ? [{ source_lead_id: ownerLeadId, source_type: "owner" as const, partner_id: ownerPartnerId, referral_code: ownerReferralCode }]
      : []),
  ];
  const { data: dealRows, error: createError } = await db.rpc("create_deal_with_commissions", {
    p_buyer_lead_id: leadId,
    p_land_id: landId,
    p_listing_ref: listingRef,
    p_listing_title: listingTitle,
    p_expected_commission: expectedCommission,
    p_assigned_to: lead.assigned_to,
    p_referral_sources: referralSources,
  });
  if (createError) throw new Error(`Create deal failed: ${createError.message}`);

  const dealResult = Array.isArray(dealRows) ? dealRows[0] : dealRows;
  const dealId = dealResult?.deal_id as string | undefined;
  const created = Boolean(dealResult?.created);
  if (!dealId) throw new Error("Create deal failed: no deal id returned");
  if (!created) redirect(`/admin/deals/${dealId}`);

  await syncBuyerLeadStatus(db, leadId);

  await addAuditNote(leadId, `เปิด Deal${listingTitle ? `: ${listingTitle}` : ""}`, admin.email);
  await sendCrmEvent("deal_created", {
    deal_id: dealId,
    lead_id: leadId,
    listing_ref: listingRef,
    stage: "qualified",
    assigned_to: lead.assigned_to,
    referral_codes: referralSources.map((source) => source.referral_code),
    referral_sides: referralSources.map((source) => source.source_type),
  });
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/deals");
  redirect(`/admin/deals/${dealId}`);
}

export async function updateDealStage(formData: FormData) {
  const admin = await requireAdmin();
  const dealId = requiredUuid(formData, "deal_id");
  const rawStage = formData.get("stage");
  if (typeof rawStage !== "string" || !DEAL_STAGES.includes(rawStage as DealStage)) throw new Error("Invalid deal stage");
  const stage = rawStage as DealStage;
  const dealValue = optionalMoney(formData, "deal_value");
  const assignedTo = optionalText(formData, "assigned_to", 100);
  const notes = optionalText(formData, "notes", 4000);

  const db = createServerClient();
  if (dealStageRequiresValue(stage) && (dealValue === null || dealValue <= 0)) {
    throw new Error("Deal value is required before marking a deal as won");
  }

  const status = dealStatusForStage(stage);
  const { data: stageRows, error } = await db.rpc("update_deal_stage_atomic", {
    p_deal_id: dealId,
    p_stage: stage,
    p_deal_value: dealValue,
    p_assigned_to: assignedTo,
    p_notes: notes,
  });
  if (error) throw new Error(`Update deal failed: ${error.message}`);

  const stageResult = Array.isArray(stageRows) ? stageRows[0] : stageRows;
  const buyerLeadId = (stageResult?.buyer_lead_id as string | null | undefined) ?? null;
  const landId = (stageResult?.land_id as string | null | undefined) ?? null;
  const previousStage = stageResult?.previous_stage as string | undefined;
  if (!previousStage) throw new Error("Update deal failed: no previous stage returned");

  if (buyerLeadId) {
    await syncBuyerLeadStatus(db, buyerLeadId);
  }
  if (landId) {
    await syncLandStatus(db, landId);
  }

  await addAuditNote(buyerLeadId, `อัปเดต Deal stage: ${stage}`, admin.email);
  await sendCrmEvent("deal_stage_changed", {
    deal_id: dealId,
    lead_id: buyerLeadId,
    previous_stage: previousStage,
    stage,
    status,
    deal_value: dealValue,
    assigned_to: assignedTo,
  });
  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${dealId}`);
  if (buyerLeadId) revalidatePath(`/admin/leads/${buyerLeadId}`);
}

export async function updateCommission(formData: FormData) {
  await requireAdmin();
  const commissionId = requiredUuid(formData, "commission_id");
  const rawStatus = formData.get("status");
  if (typeof rawStatus !== "string" || !COMMISSION_STATUSES.includes(rawStatus as CommissionStatus)) {
    throw new Error("Invalid commission status");
  }
  const status = rawStatus as CommissionStatus;
  const amountApproved = optionalMoney(formData, "amount_approved");
  const amountPaid = optionalMoney(formData, "amount_paid") ?? 0;
  if ((status === "approved" || status === "payable" || status === "paid") && amountApproved === null) {
    throw new Error("Approved commission amount is required");
  }
  if (status === "paid" && amountPaid <= 0) throw new Error("Paid amount is required");
  if (status === "paid" && amountApproved !== null && amountPaid > amountApproved) {
    throw new Error("Paid amount cannot exceed approved commission");
  }

  const db = createServerClient();
  const effectiveAmountPaid = status === "paid" ? amountPaid : 0;
  const { data: updateRows, error } = await db.rpc("update_commission_atomic", {
    p_commission_id: commissionId,
    p_status: status,
    p_amount_approved: amountApproved,
    p_amount_paid: effectiveAmountPaid,
  });
  if (error) throw new Error(`Update commission failed: ${error.message}`);

  const updateResult = Array.isArray(updateRows) ? updateRows[0] : updateRows;
  const dealId = updateResult?.deal_id as string | undefined;
  if (!dealId) throw new Error("Update commission failed: no deal id returned");

  await sendCrmEvent("commission_changed", {
    commission_id: commissionId,
    deal_id: dealId,
    status,
    amount_approved: amountApproved,
    amount_paid: effectiveAmountPaid,
  });

  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${dealId}`);
}
