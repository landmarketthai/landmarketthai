import { getSql } from "@/lib/neon/server";
import type { Deal, DealStage, DealStatus, Lead, LeadStatus, LeadType } from "@/lib/types/database";
import type { DealCreateInput, DealFilters, DealUpdateInput, LeadFilters, LeadUpdateInput } from "@/lib/operations/schemas";
import type { DealStateResult } from "@/lib/operations/rules";

export const PAGE_SIZE = 50;
const VERSION = `to_char(%s.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`;
const version = (alias: string) => VERSION.replace("%s", alias);

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

export type CrmLogEntry = { at: string; by: string; type: "status" | "note" | "assign" | "next_action"; from?: string | null; to?: string | null; text?: string; deal_id?: string };

export type LeadListItem = Omit<Lead, "details" | "consent_pdpa" | "consent_at">;
export interface LeadDetail extends Lead {
  referrals: { id: string; referral_code: string; partner_id: string | null; partner_name: string | null; converted: boolean; deal_id: string | null; first_touch_at: string }[];
  deals: { id: string; stage: DealStage; status: DealStatus; listing_title: string | null }[];
}
export interface LeadSummary { total: number; byStatus: Record<string, number>; overdue: number; unassigned: number }

function normalizeLead(row: Record<string, unknown>): Lead {
  return {
    ...normalizeLeadListItem(row),
    details: row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {},
    consent_pdpa: Boolean(row.consent_pdpa),
    consent_at: str(row.consent_at),
  };
}

function normalizeLeadListItem(row: Record<string, unknown>): LeadListItem {
  return {
    id: String(row.id),
    lead_type: row.lead_type as LeadType,
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    line_id: str(row.line_id),
    source: str(row.source),
    referral_code: str(row.referral_code),
    status: row.status as LeadStatus,
    assigned_to: str(row.assigned_to),
    next_action_at: str(row.next_action_at),
    created_at: str(row.created_at) ?? "",
    updated_at: str(row.updated_at) ?? "",
  };
}

export async function listLeads(filters: LeadFilters): Promise<LeadListItem[]> {
  const q = filters.q ?? null;
  const rows = await getSql().query(
    `select l.id, l.lead_type, l.name, l.phone, l.line_id, l.source, l.referral_code, l.status, l.assigned_to,
       l.next_action_at, l.created_at, ${version("l")}
     from leads l
     where ($1::text is null or l.name ilike $1 or l.phone ilike $1 or l.line_id ilike $1 or l.referral_code ilike $1 or l.id::text = $2)
       and ($3::text is null or l.lead_type::text = $3)
       and ($4::text is null or l.status::text = $4)
       and ($5::text is null or ($5 = '__none' and l.assigned_to is null) or l.assigned_to = $5)
       and (not $6 or (l.next_action_at < now() and l.status::text not in ('won', 'lost')))
     order by case when $7 = 'next_action' then l.next_action_at end asc nulls last, l.created_at desc
     limit ${PAGE_SIZE + 1} offset $8`,
    [q ? likePattern(q) : null, q, filters.lead_type ?? null, filters.status ?? null, filters.assigned_to ?? null,
      filters.overdue === "1", filters.sort ?? "newest", ((filters.page ?? 1) - 1) * PAGE_SIZE],
  );
  return rows.map((row) => normalizeLeadListItem(row));
}

export async function getLeadSummary(): Promise<LeadSummary> {
  const rows = await getSql().query(
    `select status::text as status, count(*)::int as n,
       count(*) filter (where next_action_at < now() and status::text not in ('won', 'lost'))::int as overdue,
       count(*) filter (where assigned_to is null and status::text not in ('won', 'lost'))::int as unassigned
     from leads group by status`,
  );
  const summary: LeadSummary = { total: 0, byStatus: {}, overdue: 0, unassigned: 0 };
  for (const row of rows) {
    summary.byStatus[String(row.status)] = Number(row.n);
    summary.total += Number(row.n);
    summary.overdue += Number(row.overdue);
    summary.unassigned += Number(row.unassigned);
  }
  return summary;
}

/** Distinct owners for filter/assignment suggestions. */
export async function getAssignees(): Promise<string[]> {
  const rows = await getSql().query(
    `select assigned_to from leads where assigned_to is not null
     union select assigned_to from deals where assigned_to is not null
     order by 1 limit 100`,
  );
  return rows.map((row) => String(row.assigned_to));
}

export async function getLead(id: string): Promise<LeadDetail | null> {
  const rows = await getSql().query(
    `select l.id, l.lead_type, l.name, l.phone, l.line_id, l.source, l.referral_code, l.status, l.assigned_to, l.next_action_at,
       l.details, l.consent_pdpa, l.consent_at, l.created_at, ${version("l")},
       (select coalesce(jsonb_agg(jsonb_build_object('id', ra.id, 'referral_code', ra.referral_code, 'partner_id', ra.partner_id,
          'partner_name', p.name, 'converted', ra.converted, 'deal_id', ra.deal_id, 'first_touch_at', ra.first_touch_at)
          order by ra.first_touch_at), '[]'::jsonb)
        from referral_attributions ra left join partners p on p.id = ra.partner_id where ra.lead_id = l.id) as referrals,
       (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'stage', d.stage, 'status', d.status,
          'listing_title', coalesce(d.listing_title, la.title_th, d.listing_ref)) order by d.created_at desc), '[]'::jsonb)
        from deals d left join lands la on la.id = d.land_id where d.buyer_lead_id = l.id) as deals
     from leads l where l.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...normalizeLead(row),
    referrals: Array.isArray(row.referrals) ? row.referrals : [],
    deals: Array.isArray(row.deals) ? row.deals : [],
  };
}

/** Optimistic update guarded by updated_at; CRM history is appended to details.crm_log. Returns false when stale. */
export async function updateLead(id: string, input: LeadUpdateInput, log: CrmLogEntry[]): Promise<boolean> {
  const rows = await getSql().query(
    `update leads set
       status = coalesce($2, status),
       assigned_to = case when $3 then $4 else assigned_to end,
       next_action_at = case when $5 then $6::timestamptz else next_action_at end,
       details = case when jsonb_array_length($7::jsonb) = 0 then details
         else jsonb_set(coalesce(details, '{}'::jsonb), '{crm_log}', case when jsonb_typeof(details->'crm_log') = 'array' then details->'crm_log' else '[]'::jsonb end || $7::jsonb) end,
       updated_at = now()
     where id = $1 and updated_at = $8::timestamptz
     returning id`,
    [id, input.status ?? null, input.assigned_to !== undefined, input.assigned_to ?? null,
      input.next_action_at !== undefined, input.next_action_at ?? null, JSON.stringify(log), input.expected_updated_at],
  );
  return rows.length > 0;
}

export type DealListItem = Pick<Deal, "id" | "stage" | "status" | "deal_value" | "expected_commission" | "assigned_to" | "land_id" | "listing_ref" | "listing_title" | "buyer_lead_id" | "referral_code" | "closed_at" | "created_at" | "updated_at"> & {
  buyer_name: string | null; partner_name: string | null;
};
export interface DealDetail extends Deal {
  buyer_name: string | null; buyer_phone: string | null; buyer_line_id: string | null; buyer_status: LeadStatus | null;
  partner_name: string | null; land_title: string | null; land_slug: string | null;
  referrals: { id: string; referral_code: string; converted: boolean; lead_id: string }[];
}

const dealSelect = (extra = "") => `select d.id, d.land_id, d.listing_ref, coalesce(d.listing_title, la.title_th) as listing_title, d.buyer_lead_id,
  d.partner_id, d.referral_code, d.deal_value, d.commission_paid, d.expected_commission, d.status, d.stage, d.assigned_to,
  d.closed_at, d.notes, d.created_at, ${version("d")}, la.title_th as land_title, la.slug as land_slug,
  bl.name as buyer_name, bl.phone as buyer_phone, bl.line_id as buyer_line_id, bl.status::text as buyer_status, p.name as partner_name${extra}
  from deals d left join lands la on la.id = d.land_id left join leads bl on bl.id = d.buyer_lead_id left join partners p on p.id = d.partner_id`;

function normalizeDeal(row: Record<string, unknown>): DealDetail {
  return {
    id: String(row.id),
    land_id: str(row.land_id),
    listing_ref: str(row.listing_ref),
    listing_title: str(row.listing_title),
    buyer_lead_id: str(row.buyer_lead_id),
    partner_id: str(row.partner_id),
    referral_code: str(row.referral_code),
    deal_value: num(row.deal_value),
    commission_paid: num(row.commission_paid),
    expected_commission: num(row.expected_commission),
    status: row.status as DealStatus,
    stage: row.stage as DealStage,
    assigned_to: str(row.assigned_to),
    closed_at: str(row.closed_at),
    notes: str(row.notes),
    created_at: str(row.created_at) ?? "",
    updated_at: str(row.updated_at) ?? "",
    buyer_name: str(row.buyer_name),
    buyer_phone: str(row.buyer_phone),
    buyer_line_id: str(row.buyer_line_id),
    buyer_status: (str(row.buyer_status) as LeadStatus | null),
    partner_name: str(row.partner_name),
    land_title: str(row.land_title),
    land_slug: str(row.land_slug),
    referrals: Array.isArray(row.referrals) ? row.referrals : [],
  };
}

// ponytail: pipeline capped at 500 newest-updated deals; add pagination when volume nears that.
export const DEAL_LIST_LIMIT = 500;

export async function listDeals(filters: DealFilters): Promise<DealListItem[]> {
  const rows = await getSql().query(
    `${dealSelect()}
     where ($1::text is null or ($1 = '__none' and d.assigned_to is null) or d.assigned_to = $1)
       and ($2::text is null or d.status::text = $2)
     order by d.updated_at desc limit ${DEAL_LIST_LIMIT}`,
    [filters.assigned_to ?? null, filters.status ?? null],
  );
  return rows.map((row) => normalizeDeal(row));
}

export async function getDeal(id: string): Promise<DealDetail | null> {
  const rows = await getSql().query(
    `${dealSelect(`, (select coalesce(jsonb_agg(jsonb_build_object('id', ra.id, 'referral_code', ra.referral_code,
       'converted', ra.converted, 'lead_id', ra.lead_id)), '[]'::jsonb) from referral_attributions ra where ra.deal_id = d.id) as referrals`)}
     where d.id = $1`,
    [id],
  );
  return rows[0] ? normalizeDeal(rows[0]) : null;
}

export type CreateDealResult =
  | { kind: "created"; id: string; attributionId: string | null }
  | { kind: "duplicate"; id: string | null }
  | { kind: "lead_not_found" };

/**
 * One statement = one transaction on Neon HTTP. Duplicate buyer+property is checked explicitly and
 * by `on conflict do nothing` so any production unique index also wins races.
 * The first referral attribution for the buyer supplies partner/referral credit; it is linked
 * (deal_id) here but only marked converted when the deal reaches stage won.
 */
export async function createDeal(input: DealCreateInput): Promise<CreateDealResult> {
  const rows = await getSql().query(
    `with lead as (
       select l.id, l.referral_code from leads l where l.id = $1 and l.lead_type::text = 'buyer'
     ), attribution as (
       select ra.id, ra.partner_id, ra.referral_code, ra.deal_id from referral_attributions ra join lead on ra.lead_id = lead.id
       order by (ra.deal_id is null) desc, ra.first_touch_at asc limit 1
     ), existing as (
       select d.id from deals d where d.buyer_lead_id = $1 and (
         ($2::uuid is not null and d.land_id = $2::uuid)
         or ($2::uuid is null and d.land_id is null and (
           ($3::text is not null and lower(d.listing_ref) = lower($3))
           or ($3::text is null and d.listing_ref is null and $4::text is not null and lower(d.listing_title) = lower($4)))))
       limit 1
     ), inserted as (
       insert into deals (land_id, listing_ref, listing_title, buyer_lead_id, partner_id, referral_code,
         deal_value, expected_commission, status, stage, assigned_to, notes)
       select $2::uuid, $3::text, $4::text, lead.id,
         coalesce((select partner_id from attribution), (select p.id from partners p where p.referral_code =
           case when exists (select 1 from attribution) then (select referral_code from attribution) else lead.referral_code end limit 1)),
         case when exists (select 1 from attribution) then (select referral_code from attribution) else lead.referral_code end,
         $5::numeric, $6::numeric, 'in_progress', 'qualified', $7::text, $8::text
       from lead where not exists (select 1 from existing)
       on conflict do nothing
       returning id
     ), linked as (
       update referral_attributions ra set deal_id = inserted.id
       from inserted, attribution where ra.id = attribution.id and attribution.deal_id is null and ra.deal_id is null
       returning ra.id
     )
     select (select id from inserted) as id, (select id from existing) as existing_id,
       exists (select 1 from lead) as lead_ok, (select id from linked) as attribution_id`,
    [input.buyer_lead_id, input.land_id ?? null, input.listing_ref ?? null, input.listing_title ?? null,
      input.deal_value ?? null, input.expected_commission ?? null, input.assigned_to ?? null, input.notes || null],
  );
  const row = rows[0] ?? {};
  if (!row.lead_ok) return { kind: "lead_not_found" };
  if (row.id) return { kind: "created", id: String(row.id), attributionId: str(row.attribution_id) };
  return { kind: "duplicate", id: str(row.existing_id) };
}

export interface UpdateDealResult { updated: boolean; wonLeadId: string | null }

/**
 * Atomic: deal fields + derived stage/status/closed_at, buyer lead -> won (never -> lost),
 * and referral conversion that is true only while the deal is won.
 */
export async function updateDeal(
  id: string,
  input: DealUpdateInput,
  state: Extract<DealStateResult, { ok: true }>,
  conversion: "won" | "unwon" | "none",
  leadLog: CrmLogEntry[],
): Promise<UpdateDealResult> {
  const rows = await getSql().query(
    `with updated as (
       update deals set stage = $2, status = $3,
         closed_at = case $4 when 'set' then now() when 'clear' then null else closed_at end,
         deal_value = case when $5 then $6::numeric else deal_value end,
         expected_commission = case when $7 then $8::numeric else expected_commission end,
         assigned_to = case when $9 then $10 else assigned_to end,
         notes = case when $11 then $12 else notes end,
         updated_at = now()
       where id = $1 and updated_at = $13::timestamptz
       returning id, buyer_lead_id, referral_code
     ), won_lead as (
       update leads l set status = 'won', updated_at = now(),
         details = jsonb_set(coalesce(l.details, '{}'::jsonb), '{crm_log}', case when jsonb_typeof(l.details->'crm_log') = 'array' then l.details->'crm_log' else '[]'::jsonb end || $15::jsonb)
       from updated u where $14 = 'won' and l.id = u.buyer_lead_id and l.status::text is distinct from 'won'
       returning l.id
     ), converted as (
       update referral_attributions ra set converted = ($14 = 'won'), deal_id = u.id
       from updated u
       where ($14 = 'won' and (ra.deal_id = u.id or (ra.lead_id = u.buyer_lead_id and ra.referral_code = u.referral_code and ra.deal_id is null and not coalesce(ra.converted, false))))
          or ($14 = 'unwon' and ra.deal_id = u.id)
       returning ra.id
     )
     select (select id from updated) as id, (select id from won_lead) as won_lead_id, (select count(*) from converted) as converted`,
    [id, state.stage, state.status, state.closedAt,
      input.deal_value !== undefined, input.deal_value ?? null,
      input.expected_commission !== undefined, input.expected_commission ?? null,
      input.assigned_to !== undefined, input.assigned_to ?? null,
      input.notes !== undefined, input.notes ?? null,
      input.expected_updated_at, conversion, JSON.stringify(leadLog)],
  );
  const row = rows[0] ?? {};
  return { updated: Boolean(row.id), wonLeadId: str(row.won_lead_id) };
}
