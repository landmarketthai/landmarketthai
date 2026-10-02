import { getSql } from "@/lib/neon/server";
import { BUYER_ACTIONS, type BuyerAdminAction } from "@/lib/marketplace/buyer-demand-workflow";
import { searchProperties } from "@/lib/neon/queries";
import { findBuyerMatches, type BuyerMatchCriteria } from "@/lib/marketplace/matching";
import { normalizeVerificationStatus } from "@/lib/marketplace/verification";
import {
  ADMIN_ACTIONS,
  LAND_STATUS_FOR_SUBMISSION,
  publishReadinessIssues,
} from "@/lib/marketplace/listing-workflow";
import type {
  DocType,
  BuyerRequirement,
  PropertySubmission,
  PropertySubmissionMedia,
  PropertyType,
  TransactionType,
  ZoningColor,
} from "@/lib/types/database";

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeSubmission(value: unknown): PropertySubmission {
  const row = value as Record<string, unknown>;
  const media = Array.isArray(row.media)
    ? row.media.map((item) => normalizeSubmissionMedia(item))
    : undefined;
  const provinceRow = row.province && typeof row.province === "object"
    ? (row.province as Record<string, unknown>)
    : null;
  return {
    id: String(row.id ?? ""),
    draft_token: String(row.draft_token ?? ""),
    user_id: str(row.user_id),
    owner_lead_id: str(row.owner_lead_id),
    linked_land_id: str(row.linked_land_id),
    property_type: (row.property_type as PropertyType | null) ?? null,
    transaction_type: (row.transaction_type as TransactionType | null) ?? null,
    title: str(row.title),
    province_id: str(row.province_id),
    district: str(row.district),
    subdistrict: str(row.subdistrict),
    address: str(row.address),
    lat: num(row.lat),
    lng: num(row.lng),
    location_precision: row.location_precision === "exact" ? "exact" : "approx",
    area_rai: num(row.area_rai),
    area_ngan: num(row.area_ngan),
    area_sqwa: num(row.area_sqwa),
    total_rai: num(row.total_rai),
    frontage_m: num(row.frontage_m),
    depth_min_m: num(row.depth_min_m),
    depth_max_m: num(row.depth_max_m),
    road_name: str(row.road_name),
    road_width_m: num(row.road_width_m),
    zoning: (row.zoning as ZoningColor | null) ?? null,
    sale_price: num(row.sale_price),
    price_per_rai: num(row.price_per_rai),
    description: str(row.description),
    contact_name: str(row.contact_name),
    contact_phone: str(row.contact_phone),
    contact_line: str(row.contact_line),
    status: row.status as PropertySubmission["status"],
    verification_status: normalizeVerificationStatus(row.verification_status),
    review_note: str(row.review_note),
    created_at: str(row.created_at) ?? "",
    updated_at: str(row.updated_at) ?? "",
    submitted_at: str(row.submitted_at),
    reviewed_at: str(row.reviewed_at),
    published_at: str(row.published_at),
    province: provinceRow
      ? {
          id: String(provinceRow.id ?? ""),
          name_th: String(provinceRow.name_th ?? ""),
          name_en: String(provinceRow.name_en ?? ""),
          slug: String(provinceRow.slug ?? ""),
          region: str(provinceRow.region),
          lat: num(provinceRow.lat),
          lng: num(provinceRow.lng),
        }
      : undefined,
    media,
  };
}

function normalizeSubmissionMedia(value: unknown): PropertySubmissionMedia {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    submission_id: String(row.submission_id ?? ""),
    media_kind: row.media_kind === "document" ? "document" : "image",
    file_name: String(row.file_name ?? ""),
    storage_key: String(row.storage_key ?? ""),
    public_url: str(row.public_url),
    mime_type: String(row.mime_type ?? ""),
    size_bytes: num(row.size_bytes) ?? 0,
    doc_type: (row.doc_type as DocType | null) ?? null,
    sort_order: num(row.sort_order) ?? 0,
    is_cover: Boolean(row.is_cover),
    created_at: str(row.created_at) ?? "",
  };
}

export interface SubmissionDraftInput {
  property_type?: PropertyType | null;
  transaction_type?: TransactionType | null;
  title?: string | null;
  province_id?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  area_rai?: number | null;
  area_ngan?: number | null;
  area_sqwa?: number | null;
  frontage_m?: number | null;
  depth_min_m?: number | null;
  depth_max_m?: number | null;
  road_name?: string | null;
  road_width_m?: number | null;
  zoning?: ZoningColor | null;
  sale_price?: number | null;
  price_per_rai?: number | null;
  description?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_line?: string | null;
}

export async function createPropertyDraft(): Promise<{ id: string; token: string }> {
  const sql = getSql();
  const rows = await sql`insert into property_submissions default values returning id, draft_token`;
  const row = rows[0];
  if (!row?.id || !row?.draft_token) throw new Error("Draft creation failed");
  return { id: String(row.id), token: String(row.draft_token) };
}

export async function getPropertyDraft(id: string, token: string): Promise<PropertySubmission | null> {
  const sql = getSql();
  const rows = await sql.query(
    `select s.*, case when p.id is null then null else to_jsonb(p.*) end as province,
       coalesce(jsonb_agg(to_jsonb(m.*) order by m.sort_order, m.created_at)
         filter (where m.id is not null), '[]'::jsonb) as media
     from property_submissions s
     left join provinces p on p.id = s.province_id
     left join property_submission_media m on m.submission_id = s.id
     where s.id = $1 and s.draft_token = $2
     group by s.id, p.id
     limit 1`,
    [id, token],
  );
  return rows[0] ? normalizeSubmission(rows[0]) : null;
}

export async function savePropertyDraft(id: string, token: string, input: SubmissionDraftInput): Promise<PropertySubmission | null> {
  const sql = getSql();
  const totalRai = input.area_rai == null && input.area_ngan == null && input.area_sqwa == null
    ? null
    : (input.area_rai ?? 0) + (input.area_ngan ?? 0) / 4 + (input.area_sqwa ?? 0) / 400;
  const pricePerRai = totalRai != null && totalRai > 0 && input.sale_price != null && input.sale_price > 0
    ? Math.round((input.sale_price / totalRai) * 100) / 100
    : null;
  const rows = await sql.query(
    `update property_submissions set
       property_type = $3, transaction_type = $4, title = $5, province_id = $6,
       district = $7, subdistrict = $8, address = $9, lat = $10, lng = $11,
       location_precision = case when $10::numeric is not null and $11::numeric is not null then 'exact' else 'approx' end,
       area_rai = $12, area_ngan = $13, area_sqwa = $14, total_rai = $15,
       frontage_m = $16, depth_min_m = $17, depth_max_m = $18, road_name = $19, road_width_m = $20,
       zoning = $21, sale_price = $22, price_per_rai = $23,
       description = $24, contact_name = $25, contact_phone = $26, contact_line = $27, updated_at = now()
     where id = $1 and draft_token = $2 and status = 'draft'
     returning *`,
    [
      id, token, input.property_type ?? null, "sale", input.title ?? null,
      input.province_id ?? null, input.district ?? null, input.subdistrict ?? null, input.address ?? null,
      input.lat ?? null, input.lng ?? null, input.area_rai ?? null, input.area_ngan ?? null,
      input.area_sqwa ?? null, totalRai, input.frontage_m ?? null, input.depth_min_m ?? null,
      input.depth_max_m ?? null, input.road_name ?? null, input.road_width_m ?? null, input.zoning ?? null,
      input.sale_price ?? null, pricePerRai,
      input.description ?? null, input.contact_name ?? null, input.contact_phone ?? null, input.contact_line ?? null,
    ],
  );
  return rows[0] ? normalizeSubmission(rows[0]) : null;
}

export async function submitPropertyDraft(input: {
  id: string;
  token: string;
  consentPdpa: boolean;
  source?: string;
}): Promise<string | null> {
  const sql = getSql();
  const rows = await sql.query(
    `with target as (
       select * from property_submissions
       where id = $1 and draft_token = $2 and status = 'draft'
         and property_type is not null and transaction_type is not null
         and title is not null and province_id is not null
         and nullif(trim(contact_name), '') is not null and nullif(trim(contact_phone), '') is not null
         and total_rai is not null and total_rai > 0
         and transaction_type = 'sale' and sale_price is not null and sale_price > 0
         and (($3::boolean = true))
     ), new_lead as (
       insert into leads (lead_type, name, phone, line_id, source, details, consent_pdpa, consent_at, status)
       select 'owner', contact_name, contact_phone, contact_line, $4,
              jsonb_build_object('property_submission_id', id, 'property_type', property_type, 'transaction_type', transaction_type),
              true, now(), 'new'
       from target
       returning id
     )
     update property_submissions s
     set owner_lead_id = nl.id, status = 'pending_review', submitted_at = now(), updated_at = now()
     from new_lead nl
     where s.id = $1
     returning s.id`,
    [input.id, input.token, input.consentPdpa, input.source ?? "/sell"],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

export async function propertyDraftExists(id: string, token: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.query(`select 1 from property_submissions where id = $1 and draft_token = $2 and status = 'draft' limit 1`, [id, token]);
  return rows.length > 0;
}

export async function insertSubmissionMedia(input: {
  submissionId: string;
  mediaKind: "image" | "document";
  fileName: string;
  storageKey: string;
  publicUrl?: string | null;
  mimeType: string;
  sizeBytes: number;
  docType?: DocType | null;
}): Promise<void> {
  const sql = getSql();
  await sql.query(
    `insert into property_submission_media
      (submission_id, media_kind, file_name, storage_key, public_url, mime_type, size_bytes, doc_type, is_cover, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,
       case when $2 = 'image' and not exists (select 1 from property_submission_media where submission_id=$1 and media_kind='image') then true else false end,
       coalesce((select max(sort_order)+1 from property_submission_media where submission_id=$1 and media_kind=$2),0))`,
    [input.submissionId, input.mediaKind, input.fileName, input.storageKey, input.publicUrl ?? null, input.mimeType, input.sizeBytes, input.docType ?? null],
  );
}

export async function listReviewSubmissions(): Promise<PropertySubmission[]> {
  const sql = getSql();
  const rows = await sql.query(
    `select s.*, case when p.id is null then null else to_jsonb(p.*) end as province,
       coalesce(jsonb_agg(to_jsonb(m.*) order by m.sort_order, m.created_at)
         filter (where m.id is not null), '[]'::jsonb) as media
     from property_submissions s
     left join provinces p on p.id=s.province_id
     left join property_submission_media m on m.submission_id=s.id
     where s.status in ('pending_review','approved','published','rejected','sold','expired')
     group by s.id,p.id
     order by case s.status when 'pending_review' then 0 when 'approved' then 1 else 2 end, s.updated_at desc
     limit 100`,
  );
  return rows.map(normalizeSubmission);
}

export async function getReviewSubmission(id: string): Promise<PropertySubmission | null> {
  const sql = getSql();
  const rows = await sql.query(
    `select s.*, case when p.id is null then null else to_jsonb(p.*) end as province,
       coalesce(jsonb_agg(to_jsonb(m.*) order by m.sort_order, m.created_at)
         filter (where m.id is not null), '[]'::jsonb) as media
     from property_submissions s
     left join provinces p on p.id=s.province_id
     left join property_submission_media m on m.submission_id=s.id
     where s.id=$1 and s.status <> 'draft'
     group by s.id,p.id
     limit 1`,
    [id],
  );
  return rows[0] ? normalizeSubmission(rows[0]) : null;
}

export async function reviewSubmission(id: string, action: "approve" | "reject", note?: string | null): Promise<boolean> {
  const sql = getSql();
  const { from, to } = ADMIN_ACTIONS[action];
  const verification = action === "approve" ? "verified" : "rejected";
  const rows = await sql.query(
    `update property_submissions
     set status=$2, verification_status=$3, review_note=coalesce($4, review_note), reviewed_at=now(), updated_at=now()
     where id=$1 and status = any($5::text[])
     returning id`,
    [id, to, verification, note ?? null, [...from]],
  );
  return rows.length > 0;
}

function slugify(title: string, id: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${base || "property"}-${id.slice(0, 8)}`;
}

export async function publishSubmission(id: string): Promise<string | null> {
  const sql = getSql();
  const submissionRows = await sql.query(`select * from property_submissions where id=$1 and status='approved' limit 1`, [id]);
  const source = submissionRows[0] as Record<string, unknown> | undefined;
  if (!source?.id || publishReadinessIssues(normalizeSubmission(source)).length) return null;

  const propertyType = String(source.property_type) as PropertyType;
  const transactionType: TransactionType = "sale";
  const landType = propertyType;
  const slug = slugify(String(source.title), String(source.id));
  const rows = await sql.query(
    `with source as (
       select id from property_submissions where id=$1 and status='approved' for update
     ), inserted_land as (
       insert into lands (
       title_th, slug, province_id, district, subdistrict, address, land_type, property_type, transaction_type,
       size_rai, area_rai, area_ngan, area_sqwa, zoning, frontage_m, depth_min_m, depth_max_m, road_name, road_width_m,
       price_per_rai, total_price, is_eec, description, lat, lng, location_precision,
       status, verification_status, is_featured, owner_lead_id, published_at
       ) select
       $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
       false,$23,$24,$25,$26,'active','verified',false,$27,now()
       from source returning id
     ), inserted_images as (
       insert into land_images (land_id, storage_key, url_or_cdn_path, alt_th, sort_order, is_cover)
       select l.id, m.storage_key, m.public_url, $2, m.sort_order, m.is_cover
       from property_submission_media m cross join inserted_land l
       where m.submission_id=$1 and m.media_kind='image' and m.public_url is not null
       returning id
     ), inserted_documents as (
       insert into land_documents (land_id, file_name, storage_key, mime_type, size_bytes, doc_type, is_sensitive)
       select l.id, m.file_name, m.storage_key, m.mime_type, m.size_bytes, coalesce(m.doc_type,'other'), true
       from property_submission_media m cross join inserted_land l
       where m.submission_id=$1 and m.media_kind='document'
       returning id
     )
     update property_submissions s
     set linked_land_id=l.id, status='published', published_at=now(), updated_at=now()
     from inserted_land l
     where s.id=$1 and s.status='approved'
     returning l.id`,
    [
      id, String(source.title), slug, String(source.province_id), str(source.district), str(source.subdistrict), str(source.address),
      landType, propertyType, transactionType, num(source.total_rai), num(source.area_rai), num(source.area_ngan), num(source.area_sqwa),
      str(source.zoning), num(source.frontage_m), num(source.depth_min_m), num(source.depth_max_m), str(source.road_name), num(source.road_width_m),
      num(source.price_per_rai), num(source.sale_price), str(source.description), num(source.lat), num(source.lng),
      source.location_precision === "exact" ? "exact" : "approx", str(source.owner_lead_id),
    ],
  );
  const landId = rows[0]?.id ? String(rows[0].id) : null;
  if (!landId) return null;
  await sql.query(`update site_stats set total_listings=(select count(*) from lands where status in ('active','sold') and deleted_at is null) where id=1`, []);
  return landId;
}

/**
 * Post-publish lifecycle (sold / archive / relist). Updates the linked land row in place —
 * never deletes — so sold listings stay searchable and updated_at records when it changed.
 */
export async function setPublishedPropertyStatus(submissionId: string, action: "sold" | "archive" | "relist"): Promise<boolean> {
  const sql = getSql();
  const { from, to } = ADMIN_ACTIONS[action];
  const landStatus = LAND_STATUS_FOR_SUBMISSION[to];
  const rows = await sql.query(
    `with updated_land as (
       update lands l set status=$3, updated_at=now()
       from property_submissions s
       where s.id=$1 and s.linked_land_id=l.id and s.status = any($4::text[]) and l.deleted_at is null
       returning l.id
     )
     update property_submissions set status=$2, updated_at=now()
     where id=$1 and status = any($4::text[]) and exists (select 1 from updated_land)
     returning id`,
    [submissionId, to, landStatus, [...from]],
  );
  if (rows.length) {
    await sql.query(`update site_stats set total_listings=(select count(*) from lands where status in ('active','sold') and deleted_at is null) where id=1`, []);
  }
  return rows.length > 0;
}

export interface BuyerRequirementInput extends BuyerMatchCriteria {
  purpose?: string | null;
  container_access?: boolean | null;
  high_voltage?: boolean | null;
  water_requirement?: string | null;
  special_requirements?: string | null;
  name: string;
  phone: string;
  line_id?: string | null;
  consent_pdpa: boolean;
  consent_public: boolean;
}

export async function createBuyerRequirement(input: BuyerRequirementInput): Promise<{ id: string; matches: Awaited<ReturnType<typeof findBuyerMatches>> }> {
  if (!input.consent_pdpa) throw new Error("PDPA consent required");
  const sql = getSql();
  if (input.province_ids.length) {
    const provinces = await sql.query(`select id from provinces where id = any($1::uuid[])`, [input.province_ids]);
    if (provinces.length !== input.province_ids.length) throw new UnknownBuyerProvinceError();
  }
  const rows = await sql.query(
    `with new_lead as (
       insert into leads (lead_type,name,phone,line_id,source,details,consent_pdpa,consent_at,status)
       values ('buyer',$1,$2,$3,'/buy-request',$4::jsonb,$5,now(),'new') returning id
     ), req as (
       insert into buyer_requirements (
         lead_id,property_type,transaction_type,preferred_locations,province_ids,min_size_rai,max_size_rai,max_price,max_price_per_rai,
         zoning,purpose,container_access,high_voltage,water_requirement,name,phone,line_id,status,
         special_requirements,consent_pdpa,consent_pdpa_at,consent_public,consent_public_at,submitted_at
       ) select id,$6,$7,$8::text[],$9::uuid[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$1,$2,$3,'pending_review',
         $19,$5,now(),$20,case when $20::boolean then now() end,now() from new_lead
       returning id
     ) select id from req`,
    [
      input.name, input.phone, input.line_id ?? null,
      JSON.stringify({ preferred_locations: input.preferred_locations, property_type: input.property_type, transaction_type: input.transaction_type }),
      input.consent_pdpa, input.property_type ?? null, "sale", input.preferred_locations, input.province_ids,
      input.min_size_rai ?? null, input.max_size_rai ?? null, input.max_price ?? null, input.max_price_per_rai ?? null,
      input.zoning ?? null, input.purpose ?? null, input.container_access ?? null, input.high_voltage ?? null, input.water_requirement ?? null,
      input.special_requirements ?? null, input.consent_public,
    ],
  );
  const id = rows[0]?.id ? String(rows[0].id) : "";
  if (!id) throw new Error("Requirement insert failed");

  // Saving succeeded even if the independent inventory lookup is unavailable.
  const matches = await findBuyerMatches(input, (limit, offset) => searchProperties({
    property_type: input.property_type ?? undefined, province_ids: input.province_ids, location_terms: input.preferred_locations, status: "active", limit, offset,
  }, { persistedOnly: true }));
  return { id, matches };
}

export class UnknownBuyerProvinceError extends Error {}

function normalizeBuyerRequirement(row: Record<string, unknown>): BuyerRequirement {
  // Private admin response only. Public queries use a separate explicit projection.
  const normalized = { ...row };
  for (const key of ["min_size_rai", "max_size_rai", "max_price", "max_price_per_rai"]) normalized[key] = num(row[key]);
  for (const key of ["created_at", "updated_at", "submitted_at", "reviewed_at", "published_at", "closed_at", "consent_pdpa_at", "consent_public_at"]) normalized[key] = str(row[key]);
  return normalized as unknown as BuyerRequirement;
}

export async function getBuyerRequirements(offset = 0, status = "", id = ""): Promise<BuyerRequirement[]> {
  // Preserve PostgreSQL microseconds for the displayed optimistic concurrency token.
  const rows = await getSql().query(`select *, (consent_pdpa and (lead_id is null or exists (select 1 from leads l where l.id = buyer_requirements.lead_id and l.consent_pdpa and l.consent_at is not null))) as consent_pdpa, (select d.slug from buyer_demand d where d.buyer_requirement_id = buyer_requirements.id and d.is_public and d.status = 'published') as public_slug, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from buyer_requirements where ($2 = '' or status = $2) and ($3 = '' or id::text = $3)
    order by submitted_at desc, id limit 51 offset $1`,
    [Number.isSafeInteger(offset) && offset >= 0 ? offset : 0, status, id]);
  return rows.map(normalizeBuyerRequirement);
}

export async function getBuyerRequirement(id: string): Promise<BuyerRequirement | null> {
  const rows = await getSql().query(`select *, (consent_pdpa and (lead_id is null or exists (select 1 from leads l where l.id = buyer_requirements.lead_id and l.consent_pdpa and l.consent_at is not null))) as consent_pdpa, (select d.slug from buyer_demand d where d.buyer_requirement_id = buyer_requirements.id and d.is_public and d.status = 'published') as public_slug, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from buyer_requirements where id = $1`, [id]);
  return rows[0] ? normalizeBuyerRequirement(rows[0]) : null;
}

export async function applyBuyerAdminAction(id: string, action: BuyerAdminAction, adminId: string, expectedUpdatedAt: string, note?: string): Promise<boolean> {
  if (!Object.hasOwn(BUYER_ACTIONS, action) || !adminId.trim()) return false;
  if (action === "reject" && !note?.trim()) return false;
  const transition = BUYER_ACTIONS[action];
  // Compare the version the admin actually reviewed, including after a prior action completed.
  // The database trigger atomically upserts or hides the sanitized projection.
  const rows = await getSql().query(
    `with locked_lead as materialized (
       select l.id,l.consent_pdpa,l.consent_at from leads l
       join buyer_requirements source on source.lead_id = l.id where source.id = $1 for update of l
     )
     update buyer_requirements r set status = $2, updated_at = now(),
       reviewed_at = case when $3 in ('approve','reject') then now() else reviewed_at end,
       reviewed_by = case when $3 in ('approve','reject') then $4 else reviewed_by end,
       review_note = coalesce($5,review_note),
       published_at = case when $3 = 'publish' then coalesce(published_at,now()) else published_at end,
       closed_at = case when $3 = 'closed' then now() else closed_at end
     where r.id = $1 and r.updated_at = $7::timestamptz and status = any($6::text[])
       and (r.lead_id is null or exists (select 1 from locked_lead))
       and ($3 not in ('approve','publish') or r.lead_id is null or exists (
         select 1 from locked_lead where consent_pdpa and consent_at is not null))
       and ($3 <> 'approve' or (consent_pdpa and consent_pdpa_at is not null))
       and ($3 <> 'publish' or (consent_pdpa and consent_public and consent_public_at is not null and consent_pdpa_at is not null
         and reviewed_at is not null and nullif(trim(reviewed_by), '') is not null))
     returning r.id`,
    [id, transition.to, action, adminId.trim(), note?.trim() || null, [...transition.from], expectedUpdatedAt],
  );
  return rows.length > 0;
}
