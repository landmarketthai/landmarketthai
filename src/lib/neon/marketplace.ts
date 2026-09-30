import { getSql } from "@/lib/neon/server";
import { searchProperties } from "@/lib/neon/queries";
import type {
  DocType,
  Land,
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
  return value === null || value === undefined || value === "" ? null : String(value);
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
    rent_price_monthly: num(row.rent_price_monthly),
    description: str(row.description),
    contact_name: str(row.contact_name),
    contact_phone: str(row.contact_phone),
    contact_line: str(row.contact_line),
    status: row.status as PropertySubmission["status"],
    verification_status: row.verification_status as PropertySubmission["verification_status"],
    review_note: str(row.review_note),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
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
    created_at: String(row.created_at ?? ""),
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
  rent_price_monthly?: number | null;
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
  const rows = await sql.query(
    `update property_submissions set
       property_type = $3, transaction_type = $4, title = $5, province_id = $6,
       district = $7, subdistrict = $8, address = $9, lat = $10, lng = $11,
       location_precision = case when $10::numeric is not null and $11::numeric is not null then 'exact' else 'approx' end,
       area_rai = $12, area_ngan = $13, area_sqwa = $14, total_rai = $15,
       frontage_m = $16, depth_min_m = $17, depth_max_m = $18, road_name = $19, road_width_m = $20,
       zoning = $21, sale_price = $22, price_per_rai = $23, rent_price_monthly = $24,
       description = $25, contact_name = $26, contact_phone = $27, contact_line = $28, updated_at = now()
     where id = $1 and draft_token = $2 and status = 'draft'
     returning *`,
    [
      id, token, input.property_type ?? null, input.transaction_type ?? null, input.title ?? null,
      input.province_id ?? null, input.district ?? null, input.subdistrict ?? null, input.address ?? null,
      input.lat ?? null, input.lng ?? null, input.area_rai ?? null, input.area_ngan ?? null,
      input.area_sqwa ?? null, totalRai, input.frontage_m ?? null, input.depth_min_m ?? null,
      input.depth_max_m ?? null, input.road_name ?? null, input.road_width_m ?? null, input.zoning ?? null,
      input.sale_price ?? null, input.price_per_rai ?? null, input.rent_price_monthly ?? null,
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
         and contact_name is not null and contact_phone is not null
         and total_rai is not null
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
  const next = action === "approve" ? "approved" : "rejected";
  const verification = action === "approve" ? "verified" : "rejected";
  const rows = await sql.query(
    `update property_submissions
     set status=$2, verification_status=$3, review_note=$4, reviewed_at=now(), updated_at=now()
     where id=$1 and status='pending_review'
     returning id`,
    [id, next, verification, note ?? null],
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
  if (!source?.id || !source.title || !source.province_id || !source.property_type || !source.transaction_type) return null;

  const propertyType = String(source.property_type) as PropertyType;
  const transactionType = String(source.transaction_type) as TransactionType;
  const landType = propertyType;
  const slug = slugify(String(source.title), String(source.id));
  const rows = await sql.query(
    `with source as (
       select id from property_submissions where id=$1 and status='approved' for update
     ), inserted_land as (
       insert into lands (
       title_th, slug, province_id, district, subdistrict, address, land_type, property_type, transaction_type,
       size_rai, area_rai, area_ngan, area_sqwa, zoning, frontage_m, depth_min_m, depth_max_m, road_name, road_width_m,
       price_per_rai, total_price, rent_price_monthly, is_eec, description, lat, lng, location_precision,
       status, verification_status, is_featured, owner_lead_id, published_at
       ) select
       $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
       false,$24,$25,$26,$27,'active','verified',false,$28,now()
       from source returning id
     ), inserted_images as (
       insert into land_images (land_id, storage_key, url_or_cdn_path, alt_th, sort_order, is_cover)
       select l.id, m.storage_key, m.public_url, $2, m.sort_order, m.is_cover
       from property_submission_media m cross join inserted_land l
       where m.submission_id=$1 and m.media_kind='image' and m.public_url is not null
       returning id
     ), inserted_documents as (
       insert into land_documents (land_id, file_name, storage_key, mime_type, size_bytes, doc_type, is_sensitive)
       select l.id, m.file_name, m.storage_key, m.mime_type, m.size_bytes, coalesce(m.doc_type,'other')::doc_type_enum, true
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
      num(source.price_per_rai), num(source.sale_price), num(source.rent_price_monthly), str(source.description), num(source.lat), num(source.lng),
      source.location_precision === "exact" ? "exact" : "approx", str(source.owner_lead_id),
    ],
  );
  const landId = rows[0]?.id ? String(rows[0].id) : null;
  if (!landId) return null;
  await sql.query(`update site_stats set total_listings=(select count(*) from lands where status in ('active','sold') and deleted_at is null) where id=1`, []);
  return landId;
}

export async function setPublishedPropertyStatus(submissionId: string, status: "sold" | "expired"): Promise<boolean> {
  const sql = getSql();
  const landStatus = status === "sold" ? "sold" : "expired";
  const rows = await sql.query(
    `with updated_land as (
       update lands l set status=$2, updated_at=now()
       from property_submissions s
       where s.id=$1 and s.linked_land_id=l.id and s.status in ('published','sold','expired')
       returning l.id
     )
     update property_submissions set status=$2, updated_at=now()
     where id=$1 and exists (select 1 from updated_land)
     returning id`,
    [submissionId, landStatus],
  );
  if (rows.length) {
    await sql.query(`update site_stats set total_listings=(select count(*) from lands where status in ('active','sold') and deleted_at is null) where id=1`, []);
  }
  return rows.length > 0;
}

export interface BuyerRequirementInput {
  property_type?: PropertyType | null;
  transaction_type: TransactionType;
  preferred_locations: string[];
  province_ids: string[];
  min_size_rai?: number | null;
  max_size_rai?: number | null;
  max_price?: number | null;
  max_price_per_rai?: number | null;
  zoning?: ZoningColor | null;
  purpose?: string | null;
  container_access?: boolean | null;
  high_voltage?: boolean | null;
  water_requirement?: string | null;
  name: string;
  phone: string;
  line_id?: string | null;
  consent_pdpa: boolean;
}

export async function createBuyerRequirement(input: BuyerRequirementInput): Promise<{ id: string; matches: { full: Land[]; near: Land[] } }> {
  const sql = getSql();
  const rows = await sql.query(
    `with new_lead as (
       insert into leads (lead_type,name,phone,line_id,source,details,consent_pdpa,consent_at,status)
       values ('buyer',$1,$2,$3,'/buy-request',$4::jsonb,$5,now(),'new') returning id
     ), req as (
       insert into buyer_requirements (
         lead_id,property_type,transaction_type,preferred_locations,province_ids,min_size_rai,max_size_rai,max_price,max_price_per_rai,
         zoning,purpose,container_access,high_voltage,water_requirement,name,phone,line_id,status
       ) select id,$6,$7,$8::text[],$9::uuid[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$1,$2,$3,'active' from new_lead
       returning id
     ) select id from req`,
    [
      input.name, input.phone, input.line_id ?? null,
      JSON.stringify({ preferred_locations: input.preferred_locations, property_type: input.property_type, transaction_type: input.transaction_type }),
      input.consent_pdpa, input.property_type ?? null, input.transaction_type, input.preferred_locations, input.province_ids,
      input.min_size_rai ?? null, input.max_size_rai ?? null, input.max_price ?? null, input.max_price_per_rai ?? null,
      input.zoning ?? null, input.purpose ?? null, input.container_access ?? null, input.high_voltage ?? null, input.water_requirement ?? null,
    ],
  );
  const id = rows[0]?.id ? String(rows[0].id) : "";
  if (!id) throw new Error("Requirement insert failed");

  const candidates = await searchProperties({
    property_type: input.property_type ?? undefined,
    transaction_type: input.transaction_type,
    limit: 100,
  });

  const full: Land[] = [];
  const near: Land[] = [];
  for (const property of candidates) {
    if (property.status !== "active") continue;
    const locationText = [property.title_th, property.address, property.subdistrict, property.district, property.province?.name_th]
      .filter(Boolean).join(" ").toLocaleLowerCase("th");
    const locationOk = (input.province_ids.length === 0 || input.province_ids.includes(property.province_id))
      && (input.preferred_locations.length === 0 || input.preferred_locations.some((location) => locationText.includes(location.toLocaleLowerCase("th"))));
    const sizeOk = (input.min_size_rai == null || (property.size_rai != null && property.size_rai >= input.min_size_rai))
      && (input.max_size_rai == null || (property.size_rai != null && property.size_rai <= input.max_size_rai));
    const propertyPrice = property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
    const budgetOk = input.max_price == null || (propertyPrice != null && propertyPrice <= input.max_price);
    const perRaiOk = input.max_price_per_rai == null || (property.price_per_rai != null && property.price_per_rai <= input.max_price_per_rai);
    const zoningOk = input.zoning == null || property.zoning === input.zoning;
    if (locationOk && sizeOk && budgetOk && perRaiOk && zoningOk) full.push(property);
    else near.push(property);
  }

  return { id, matches: { full: full.slice(0, 12), near: near.slice(0, 12) } };
}
