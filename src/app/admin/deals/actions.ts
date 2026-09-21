"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { sendCrmEvent } from "@/lib/crm-webhook";
import { dealStatusForStage } from "@/lib/deal-pipeline";
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
  let ownerAttribution: { partner_id: string | null; referral_code: string } | null = null;
  if (landId) {
    const { data: land, error: landError } = await db.from("lands").select("owner_lead_id").eq("id", landId).maybeSingle();
    if (landError) throw new Error(`Load land owner source failed: ${landError.message}`);
    ownerLeadId = land?.owner_lead_id ?? null;
    if (ownerLeadId) {
      const { data: source, error: sourceError } = await db
        .from("referral_attributions")
        .select("partner_id,referral_code")
        .eq("lead_id", ownerLeadId)
        .limit(1)
        .maybeSingle();
      if (sourceError && sourceError.code !== "PGRST116") throw new Error(`Load owner attribution failed: ${sourceError.message}`);
      ownerAttribution = source ?? null;
    }
  }

  let duplicateQuery = db.from("deals").select("id").eq("buyer_lead_id", leadId);
  duplicateQuery = listingRef ? duplicateQuery.eq("listing_ref", listingRef) : duplicateQuery.eq("land_id", landId!);
  const { data: existingDeal, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
  if (duplicateError && duplicateError.code !== "PGRST116") throw new Error(`Check existing deal failed: ${duplicateError.message}`);
  if (existingDeal?.id) redirect(`/admin/deals/${existingDeal.id}`);

  const buyerReferralCode = buyerAttribution?.referral_code ?? lead.referral_code ?? null;
  const buyerPartnerId = buyerAttribution?.partner_id ?? null;
  const referralSources = [
    ...(buyerReferralCode ? [{ source_lead_id: leadId, source_type: "buyer" as const, partner_id: buyerPartnerId, referral_code: buyerReferralCode }] : []),
    ...(ownerLeadId && ownerAttribution?.referral_code
      ? [{ source_lead_id: ownerLeadId, source_type: "owner" as const, partner_id: ownerAttribution.partner_id, referral_code: ownerAttribution.referral_code }]
      : []),
  ];
  const primaryReferral = referralSources[0] ?? null;
  const commissionEstimate = referralSources.length === 1 ? expectedCommission : null;

  const { data: deal, error } = await db
    .from("deals")
    .insert({
      land_id: landId,
      listing_ref: listingRef,
      listing_title: listingTitle,
      buyer_lead_id: leadId,
      partner_id: primaryReferral?.partner_id ?? null,
      referral_code: primaryReferral?.referral_code ?? null,
      deal_value: null,
      commission_paid: null,
      expected_commission: referralSources.length > 0 ? expectedCommission : null,
      status: "in_progress",
      stage: "qualified",
      assigned_to: lead.assigned_to,
      notes: null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !deal) throw new Error(`Create deal failed: ${error?.message ?? "Unknown error"}`);

  if (referralSources.length > 0) {
    const { error: commissionError } = await db.from("commissions").insert(
      referralSources.map((source) => ({
        deal_id: deal.id,
        source_lead_id: source.source_lead_id,
        source_type: source.source_type,
        partner_id: source.partner_id,
        referral_code: source.referral_code,
        amount_estimated: commissionEstimate,
        status: "estimated",
        amount_paid: 0,
      }))
    );
    if (commissionError) console.error(`Create commission estimate failed deal_id=${deal.id}:`, commissionError.message);
  }

  await syncBuyerLeadStatus(db, leadId);

  await addAuditNote(leadId, `เปิด Deal${listingTitle ? `: ${listingTitle}` : ""}`, admin.email);
  await sendCrmEvent("deal_created", {
    deal_id: deal.id,
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
  redirect(`/admin/deals/${deal.id}`);
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
  const { data: existing, error: loadError } = await db
    .from("deals")
    .select("buyer_lead_id,land_id,stage")
    .eq("id", dealId)
    .maybeSingle();
  if (loadError) throw new Error(`Load deal failed: ${loadError.message}`);
  if (!existing) throw new Error("Deal not found");

  const status = dealStatusForStage(stage);
  const now = new Date().toISOString();
  const { error } = await db
    .from("deals")
    .update({
      stage,
      status,
      deal_value: dealValue,
      assigned_to: assignedTo,
      notes,
      closed_at: stage === "won" || stage === "lost" ? now : null,
      updated_at: now,
    })
    .eq("id", dealId);
  if (error) throw new Error(`Update deal failed: ${error.message}`);

  if (stage === "lost") {
    await db.from("commissions").update({ status: "cancelled", updated_at: now }).eq("deal_id", dealId).neq("status", "paid");
  }
  if (existing.buyer_lead_id) {
    await syncBuyerLeadStatus(db, existing.buyer_lead_id);
  }
  if (existing.land_id) {
    await syncLandStatus(db, existing.land_id);
  }

  await addAuditNote(existing.buyer_lead_id, `อัปเดต Deal stage: ${stage}`, admin.email);
  await sendCrmEvent("deal_stage_changed", {
    deal_id: dealId,
    lead_id: existing.buyer_lead_id,
    previous_stage: existing.stage,
    stage,
    status,
    deal_value: dealValue,
    assigned_to: assignedTo,
  });
  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${dealId}`);
  if (existing.buyer_lead_id) revalidatePath(`/admin/leads/${existing.buyer_lead_id}`);
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

  const now = new Date().toISOString();
  const db = createServerClient();
  const { data: commission, error: loadError } = await db.from("commissions").select("deal_id,partner_id").eq("id", commissionId).maybeSingle();
  if (loadError) throw new Error(`Load commission failed: ${loadError.message}`);
  if (!commission) throw new Error("Commission not found");

  const { error } = await db.from("commissions").update({
    status,
    amount_approved: amountApproved,
    amount_paid: amountPaid,
    approved_at: ["approved", "payable", "paid"].includes(status) ? now : null,
    paid_at: status === "paid" ? now : null,
    updated_at: now,
  }).eq("id", commissionId);
  if (error) throw new Error(`Update commission failed: ${error.message}`);

  await db
    .from("deals")
    .update({ commission_paid: status === "paid" ? amountPaid : null, updated_at: now })
    .eq("id", commission.deal_id);

  if (commission.partner_id) {
    const { data: paidRows, error: paidRowsError } = await db
      .from("commissions")
      .select("amount_paid")
      .eq("partner_id", commission.partner_id)
      .eq("status", "paid");
    if (paidRowsError) throw new Error(`Recalculate partner total failed: ${paidRowsError.message}`);
    const totalPaid = (paidRows ?? []).reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0);
    const { error: partnerError } = await db
      .from("partners")
      .update({ total_paid: totalPaid, updated_at: now })
      .eq("id", commission.partner_id);
    if (partnerError) throw new Error(`Update partner total failed: ${partnerError.message}`);
  }

  await sendCrmEvent("commission_changed", {
    commission_id: commissionId,
    deal_id: commission.deal_id,
    status,
    amount_approved: amountApproved,
    amount_paid: amountPaid,
  });

  revalidatePath("/admin/deals");
  revalidatePath(`/admin/deals/${commission.deal_id}`);
}
