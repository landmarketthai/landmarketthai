import { getSql } from "@/lib/neon/server";
import type { DocType, EntityType, LeadType } from "@/lib/types/database";

export interface NewLeadInput {
  leadType: LeadType;
  name: string;
  phone: string;
  lineId?: string | null;
  source?: string | null;
  referralCode?: string | null;
  details?: Record<string, unknown>;
  consentPdpa: boolean;
  consentAt?: string | null;
}

export async function resolveActivePartner(referralCode: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql.query(
    `select id from partners where referral_code = $1 and status = 'active' limit 1`,
    [referralCode],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

export async function insertLead(input: NewLeadInput): Promise<string> {
  const sql = getSql();
  const rows = await sql.query(
    `insert into leads (
       lead_type, name, phone, line_id, source, referral_code,
       details, consent_pdpa, consent_at, status
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'new')
     returning id`,
    [
      input.leadType,
      input.name,
      input.phone,
      input.lineId ?? null,
      input.source ?? null,
      input.referralCode ?? null,
      JSON.stringify(input.details ?? {}),
      input.consentPdpa,
      input.consentAt ?? null,
    ],
  );

  const id = rows[0]?.id;
  if (!id) throw new Error("Lead insert did not return an id");
  return String(id);
}

export async function insertReferralAttribution(input: {
  leadId: string;
  referralCode: string;
  partnerId: string;
  entityType: EntityType;
}): Promise<void> {
  const sql = getSql();
  await sql.query(
    `insert into referral_attributions (
       referral_code, lead_id, partner_id, entity_type, first_touch_at
     ) values ($1, $2, $3, $4, now())`,
    [input.referralCode, input.leadId, input.partnerId, input.entityType],
  );
}

export async function leadExists(leadId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.query(`select 1 from leads where id = $1 limit 1`, [leadId]);
  return rows.length > 0;
}

export async function insertLeadAttachment(input: {
  leadId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  docType?: DocType | null;
}): Promise<void> {
  const sql = getSql();
  await sql.query(
    `insert into lead_attachments (
       lead_id, file_name, storage_key, mime_type, size_bytes, doc_type, is_sensitive
     ) values ($1, $2, $3, $4, $5, $6, true)`,
    [
      input.leadId,
      input.fileName,
      input.storageKey,
      input.mimeType,
      input.sizeBytes,
      input.docType ?? "other",
    ],
  );
}

export async function insertEvent(input: {
  eventType: string;
  entityType?: string;
  entityId?: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  await sql.query(
    `insert into events (event_type, entity_type, entity_id, session_id, meta)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      input.sessionId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );
}
