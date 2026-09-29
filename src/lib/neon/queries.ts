import { getSqlIfConfigured } from "@/lib/neon/server";
import type {
  BlogPost,
  BuyerDemand,
  Land,
  LandImage,
  Province,
  SiteStats,
} from "@/lib/types/database";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeProvince(value: unknown): Province | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    name_th: String(row.name_th ?? ""),
    name_en: String(row.name_en ?? ""),
    slug: String(row.slug ?? ""),
    region: stringOrNull(row.region),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
  };
}

function normalizeImage(value: unknown): LandImage {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    land_id: String(row.land_id ?? ""),
    storage_key: String(row.storage_key ?? ""),
    url_or_cdn_path: String(row.url_or_cdn_path ?? ""),
    width: numberOrNull(row.width),
    height: numberOrNull(row.height),
    alt_th: stringOrNull(row.alt_th),
    sort_order: numberOrNull(row.sort_order) ?? 0,
    is_cover: Boolean(row.is_cover),
    created_at: String(row.created_at ?? ""),
  };
}

function normalizeLand(value: unknown): Land {
  const row = value as Record<string, unknown>;
  const images = Array.isArray(row.images) ? row.images.map(normalizeImage) : [];

  return {
    id: String(row.id ?? ""),
    public_ref: numberOrNull(row.public_ref) ?? 0,
    title_th: String(row.title_th ?? ""),
    slug: String(row.slug ?? ""),
    province_id: String(row.province_id ?? ""),
    district: stringOrNull(row.district),
    land_type: row.land_type as Land["land_type"],
    size_rai: numberOrNull(row.size_rai) ?? 0,
    zoning: row.zoning == null ? null : (row.zoning as Land["zoning"]),
    frontage_m: numberOrNull(row.frontage_m),
    price_per_rai: numberOrNull(row.price_per_rai) ?? 0,
    total_price: numberOrNull(row.total_price),
    referral_reward_max: numberOrNull(row.referral_reward_max),
    is_eec: Boolean(row.is_eec),
    nearby_landmarks: Array.isArray(row.nearby_landmarks)
      ? row.nearby_landmarks.map(String)
      : null,
    description: stringOrNull(row.description),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    location_precision: row.location_precision as Land["location_precision"],
    status: row.status as Land["status"],
    is_featured: Boolean(row.is_featured),
    seo_title: stringOrNull(row.seo_title),
    seo_description: stringOrNull(row.seo_description),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    deleted_at: stringOrNull(row.deleted_at),
    province: normalizeProvince(row.province),
    images,
  };
}

const LAND_SELECT = `
  select
    l.*,
    to_jsonb(p.*) as province,
    coalesce(
      jsonb_agg(to_jsonb(i.*) order by i.sort_order, i.created_at)
        filter (where i.id is not null),
      '[]'::jsonb
    ) as images
  from lands l
  join provinces p on p.id = l.province_id
  left join land_images i on i.land_id = l.id
`;

async function publicListingRows(opts?: {
  province_slug?: string;
  land_type?: string;
  limit?: number;
  offset?: number;
}) {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);

  if (opts?.province_slug && opts?.land_type) {
    return sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'sold') and l.deleted_at is null
         and p.slug = $1 and l.land_type = $2
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc
       limit $3 offset $4`,
      [opts.province_slug, opts.land_type, limit, offset],
    );
  }

  if (opts?.province_slug) {
    return sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'sold') and l.deleted_at is null and p.slug = $1
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc
       limit $2 offset $3`,
      [opts.province_slug, limit, offset],
    );
  }

  if (opts?.land_type) {
    return sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'sold') and l.deleted_at is null and l.land_type = $1
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc
       limit $2 offset $3`,
      [opts.land_type, limit, offset],
    );
  }

  return sql.query(
    `${LAND_SELECT}
     where l.status in ('active', 'sold') and l.deleted_at is null
     group by l.id, p.id
     order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc
     limit $1 offset $2`,
    [limit, offset],
  );
}

export async function getPublicListings(opts?: {
  province_slug?: string;
  land_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Land[]> {
  const rows = await publicListingRows(opts);
  return rows.map(normalizeLand);
}

export async function getFeaturedListings(limit = 6): Promise<Land[]> {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await sql.query(
    `${LAND_SELECT}
     where l.status in ('active', 'sold') and l.deleted_at is null and l.is_featured = true
     group by l.id, p.id
     order by case when l.status = 'active' then 0 else 1 end, l.created_at desc
     limit $1`,
    [safeLimit],
  );

  return rows.map(normalizeLand);
}

export async function getListingByRef(publicRef: number): Promise<Land | null> {
  const sql = getSqlIfConfigured();
  if (!sql) return null;

  const rows = await sql.query(
    `${LAND_SELECT}
     where l.public_ref = $1 and l.status in ('active', 'sold') and l.deleted_at is null
     group by l.id, p.id
     limit 1`,
    [publicRef],
  );

  return rows[0] ? normalizeLand(rows[0]) : null;
}

export async function getRelatedListings(land: Land, limit = 4): Promise<Land[]> {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const rows = await sql.query(
    `${LAND_SELECT}
     where l.status = 'active' and l.deleted_at is null
       and l.province_id = $1 and l.land_type = $2 and l.id <> $3
     group by l.id, p.id
     order by l.is_featured desc, l.created_at desc
     limit $4`,
    [land.province_id, land.land_type, land.id, safeLimit],
  );

  return rows.map(normalizeLand);
}

export async function getAllProvinces(): Promise<Province[]> {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const rows = await sql`select * from provinces order by name_th`;
  return rows
    .map((row) => normalizeProvince(row))
    .filter((row): row is Province => Boolean(row));
}

export async function getProvinceBySlug(slug: string): Promise<Province | null> {
  const sql = getSqlIfConfigured();
  if (!sql) return null;

  const rows = await sql`select * from provinces where slug = ${slug} limit 1`;
  return rows[0] ? normalizeProvince(rows[0]) ?? null : null;
}

function normalizeDemand(value: unknown): BuyerDemand {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    province_id: stringOrNull(row.province_id),
    land_type: row.land_type == null ? null : (row.land_type as BuyerDemand["land_type"]),
    size_min_rai: numberOrNull(row.size_min_rai),
    size_max_rai: numberOrNull(row.size_max_rai),
    intended_use: stringOrNull(row.intended_use),
    budget_note: stringOrNull(row.budget_note),
    status: row.status as BuyerDemand["status"],
    is_public: Boolean(row.is_public),
    seo_title: stringOrNull(row.seo_title),
    seo_description: stringOrNull(row.seo_description),
    created_at: String(row.created_at ?? ""),
    province: normalizeProvince(row.province),
  };
}

export async function getActiveDemands(limit = 20): Promise<BuyerDemand[]> {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await sql.query(
    `select d.*, case when p.id is null then null else to_jsonb(p.*) end as province
     from buyer_demand d
     left join provinces p on p.id = d.province_id
     where d.status = 'active' and d.is_public = true
     order by d.created_at desc
     limit $1`,
    [safeLimit],
  );

  return rows.map(normalizeDemand);
}

export async function getDemandBySlug(slug: string): Promise<BuyerDemand | null> {
  const sql = getSqlIfConfigured();
  if (!sql) return null;

  const rows = await sql.query(
    `select d.*, case when p.id is null then null else to_jsonb(p.*) end as province
     from buyer_demand d
     left join provinces p on p.id = d.province_id
     where d.slug = $1 and d.is_public = true
     limit 1`,
    [slug],
  );

  return rows[0] ? normalizeDemand(rows[0]) : null;
}

function normalizePost(value: unknown): BlogPost {
  const row = value as Record<string, unknown>;
  const category = row.category && typeof row.category === "object"
    ? (row.category as Record<string, unknown>)
    : null;

  return {
    id: String(row.id ?? ""),
    title_th: String(row.title_th ?? ""),
    slug: String(row.slug ?? ""),
    excerpt: stringOrNull(row.excerpt),
    body: stringOrNull(row.body),
    cover_image_key: stringOrNull(row.cover_image_key),
    category_id: stringOrNull(row.category_id),
    status: row.status as BlogPost["status"],
    published_at: stringOrNull(row.published_at),
    seo_title: stringOrNull(row.seo_title),
    seo_description: stringOrNull(row.seo_description),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    category: category
      ? {
          id: String(category.id ?? ""),
          name_th: String(category.name_th ?? ""),
          slug: String(category.slug ?? ""),
          type: category.type as "blog" | "land",
          parent_id: stringOrNull(category.parent_id),
        }
      : undefined,
  };
}

export async function getPublishedPosts(opts?: {
  category_slug?: string;
  limit?: number;
}): Promise<BlogPost[]> {
  const sql = getSqlIfConfigured();
  if (!sql) return [];

  const safeLimit = Math.min(Math.max(opts?.limit ?? 100, 1), 100);
  const rows = opts?.category_slug
    ? await sql.query(
        `select b.*, case when c.id is null then null else to_jsonb(c.*) end as category
         from blog_posts b
         join categories c on c.id = b.category_id
         where b.status = 'published' and c.slug = $1
         order by b.published_at desc nulls last
         limit $2`,
        [opts.category_slug, safeLimit],
      )
    : await sql.query(
        `select b.*, case when c.id is null then null else to_jsonb(c.*) end as category
         from blog_posts b
         left join categories c on c.id = b.category_id
         where b.status = 'published'
         order by b.published_at desc nulls last
         limit $1`,
        [safeLimit],
      );

  return rows.map(normalizePost);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const sql = getSqlIfConfigured();
  if (!sql) return null;

  const rows = await sql.query(
    `select b.*, case when c.id is null then null else to_jsonb(c.*) end as category
     from blog_posts b
     left join categories c on c.id = b.category_id
     where b.slug = $1 and b.status = 'published'
     limit 1`,
    [slug],
  );

  return rows[0] ? normalizePost(rows[0]) : null;
}

export async function getSiteStats(): Promise<SiteStats> {
  const sql = getSqlIfConfigured();
  if (!sql) {
    return { total_partners: 0, total_listings: 0, total_deals: 0, total_payout_mb: 0 };
  }

  try {
    const rows = await sql`select total_partners, total_listings, total_deals, total_payout_mb from site_stats where id = 1 limit 1`;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return { total_partners: 0, total_listings: 0, total_deals: 0, total_payout_mb: 0 };
    }
    return {
      total_partners: numberOrNull(row.total_partners) ?? 0,
      total_listings: numberOrNull(row.total_listings) ?? 0,
      total_deals: numberOrNull(row.total_deals) ?? 0,
      total_payout_mb: numberOrNull(row.total_payout_mb) ?? 0,
    };
  } catch {
    return { total_partners: 0, total_listings: 0, total_deals: 0, total_payout_mb: 0 };
  }
}
