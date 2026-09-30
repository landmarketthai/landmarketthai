import { unstable_cache } from "next/cache";
import { getSqlIfConfigured } from "@/lib/neon/server";
import type {
  BlogPost,
  BuyerDemand,
  Land,
  LandImage,
  Province,
  SiteStats,
} from "@/lib/types/database";
import {
  SEED_PUBLIC_LISTINGS,
  mergeWithSeedListings,
  sortSeedListings,
} from "@/lib/seed-listings";

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
  const landType = row.land_type as Land["land_type"];
  const propertyType =
    row.property_type === "factory" || row.property_type === "warehouse" || row.property_type === "land"
      ? (row.property_type as Land["property_type"])
      : landType === "factory"
        ? "factory"
        : landType === "warehouse"
          ? "warehouse"
          : "land";

  return {
    id: String(row.id ?? ""),
    public_ref: numberOrNull(row.public_ref) ?? 0,
    title_th: String(row.title_th ?? ""),
    slug: String(row.slug ?? ""),
    province_id: String(row.province_id ?? ""),
    district: stringOrNull(row.district),
    subdistrict: stringOrNull(row.subdistrict),
    address: stringOrNull(row.address),
    land_type: landType,
    property_type: propertyType,
    transaction_type: row.transaction_type === "rent" ? "rent" : "sale",
    size_rai: numberOrNull(row.size_rai),
    area_rai: numberOrNull(row.area_rai),
    area_ngan: numberOrNull(row.area_ngan),
    area_sqwa: numberOrNull(row.area_sqwa),
    zoning: row.zoning == null ? null : (row.zoning as Land["zoning"]),
    frontage_m: numberOrNull(row.frontage_m),
    depth_min_m: numberOrNull(row.depth_min_m),
    depth_max_m: numberOrNull(row.depth_max_m),
    road_name: stringOrNull(row.road_name),
    road_width_m: numberOrNull(row.road_width_m),
    price_per_rai: numberOrNull(row.price_per_rai),
    total_price: numberOrNull(row.total_price),
    rent_price_monthly: numberOrNull(row.rent_price_monthly),
    referral_reward_max: numberOrNull(row.referral_reward_max),
    is_eec: Boolean(row.is_eec),
    nearby_landmarks: Array.isArray(row.nearby_landmarks) ? row.nearby_landmarks.map(String) : null,
    description: stringOrNull(row.description),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    location_precision: row.location_precision === "exact" ? "exact" : "approx",
    status: row.status as Land["status"],
    verification_status:
      row.verification_status === "pending" || row.verification_status === "rejected"
        ? row.verification_status
        : "verified",
    is_featured: Boolean(row.is_featured),
    seo_title: stringOrNull(row.seo_title),
    seo_description: stringOrNull(row.seo_description),
    published_at: stringOrNull(row.published_at),
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

const PUBLIC_LISTINGS_CACHE_SECONDS = 60;

const getCachedPublicListings = unstable_cache(
  async (
    provinceSlug: string | null,
    landType: string | null,
    limit: number,
    offset: number,
  ): Promise<Land[]> => {
    const rows = await publicListingRows({
      province_slug: provinceSlug ?? undefined,
      land_type: landType ?? undefined,
      limit,
      offset,
    });
    return rows.map(normalizeLand);
  },
  ["neon-public-listings-v1"],
  { revalidate: PUBLIC_LISTINGS_CACHE_SECONDS },
);

export async function getPublicListings(opts?: {
  province_slug?: string;
  land_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Land[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const dbListings = await getCachedPublicListings(
    opts?.province_slug ?? null,
    opts?.land_type ?? null,
    limit,
    offset,
  );

  if (offset > 0) return dbListings;

  return sortSeedListings(
    mergeWithSeedListings(dbListings, {
      province_slug: opts?.province_slug,
      land_type: opts?.land_type as Land["land_type"] | undefined,
    }),
  ).slice(0, limit);
}

export async function getFeaturedListings(limit = 6): Promise<Land[]> {
  const sql = getSqlIfConfigured();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  let dbListings: Land[] = [];

  if (sql) {
    const rows = await sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'sold') and l.deleted_at is null and l.is_featured = true
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.created_at desc
       limit $1`,
      [safeLimit],
    );
    dbListings = rows.map(normalizeLand);
  }

  return sortSeedListings(mergeWithSeedListings(dbListings))
    .filter((land) => land.is_featured)
    .slice(0, safeLimit);
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
  const seedProvinces = SEED_PUBLIC_LISTINGS
    .map((property) => property.province)
    .filter((province): province is Province => Boolean(province))
    .filter((province, index, provinces) => provinces.findIndex((item) => item.slug === province.slug) === index);
  const sql = getSqlIfConfigured();
  if (!sql) return seedProvinces;

  const rows = await sql`select * from provinces order by name_th`;
  const dbProvinces = rows
    .map((row) => normalizeProvince(row))
    .filter((row): row is Province => Boolean(row));
  const dbSlugs = new Set(dbProvinces.map((province) => province.slug));
  return [...dbProvinces, ...seedProvinces.filter((province) => !dbSlugs.has(province.slug))];
}

const getCachedProvinceBySlug = unstable_cache(
  async (slug: string): Promise<Province | null> => {
    const sql = getSqlIfConfigured();
    if (!sql) return null;

    const rows = await sql`select * from provinces where slug = ${slug} limit 1`;
    return rows[0] ? normalizeProvince(rows[0]) ?? null : null;
  },
  ["neon-province-by-slug-v1"],
  { revalidate: 3600 },
);

export async function getProvinceBySlug(slug: string): Promise<Province | null> {
  return getCachedProvinceBySlug(slug);
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

export interface PropertySearchFilters {
  q?: string;
  transaction_type?: "sale" | "rent";
  property_type?: "land" | "factory" | "warehouse";
  province_slug?: string;
  district?: string;
  min_price?: number;
  max_price?: number;
  min_price_per_rai?: number;
  max_price_per_rai?: number;
  min_size_rai?: number;
  max_size_rai?: number;
  zoning?: string;
  eec?: boolean;
  west?: number;
  south?: number;
  east?: number;
  north?: number;
  limit?: number;
  offset?: number;
}

function propertyMatchesSearchFilters(property: Land, filters: PropertySearchFilters): boolean {
  if (property.status !== "active" && property.status !== "sold") return false;

  const q = filters.q?.trim().toLocaleLowerCase("th-TH");
  if (q) {
    const haystack = [
      property.title_th,
      property.district,
      property.subdistrict,
      property.province?.name_th,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("th-TH");
    if (!haystack.includes(q)) return false;
  }
  if (filters.transaction_type && property.transaction_type !== filters.transaction_type) return false;
  if (filters.property_type && property.property_type !== filters.property_type) return false;
  if (filters.province_slug && property.province?.slug !== filters.province_slug) return false;
  if (filters.district?.trim() && !property.district?.toLocaleLowerCase("th-TH").includes(filters.district.trim().toLocaleLowerCase("th-TH"))) return false;

  const price = property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
  if (filters.min_price != null && (price == null || price < filters.min_price)) return false;
  if (filters.max_price != null && (price == null || price > filters.max_price)) return false;
  if (filters.min_price_per_rai != null && (property.price_per_rai == null || property.price_per_rai < filters.min_price_per_rai)) return false;
  if (filters.max_price_per_rai != null && (property.price_per_rai == null || property.price_per_rai > filters.max_price_per_rai)) return false;
  if (filters.min_size_rai != null && (property.size_rai == null || property.size_rai < filters.min_size_rai)) return false;
  if (filters.max_size_rai != null && (property.size_rai == null || property.size_rai > filters.max_size_rai)) return false;
  if (filters.zoning && property.zoning !== filters.zoning) return false;
  if (filters.eec != null && property.is_eec !== filters.eec) return false;

  const hasBounds = [filters.west, filters.south, filters.east, filters.north].every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (hasBounds) {
    if (property.lat == null || property.lng == null) return false;
    if (property.lng < filters.west! || property.lng > filters.east!) return false;
    if (property.lat < filters.south! || property.lat > filters.north!) return false;
  }

  return true;
}

function enrichKnownListingCoordinates(property: Land): Land {
  const seed = SEED_PUBLIC_LISTINGS.find((item) => item.slug === property.slug);
  if (!seed) return property;
  return {
    ...property,
    lat: property.lat ?? seed.lat,
    lng: property.lng ?? seed.lng,
    location_precision: property.lat != null && property.lng != null
      ? property.location_precision
      : seed.location_precision,
  };
}

export async function searchProperties(filters: PropertySearchFilters = {}): Promise<Land[]> {
  const sql = getSqlIfConfigured();

  const clauses = ["l.status in ('active', 'sold')", "l.deleted_at is null"];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.q?.trim()) {
    const p = add(`%${filters.q.trim()}%`);
    clauses.push(`(l.title_th ilike ${p} or coalesce(l.district, '') ilike ${p} or coalesce(l.subdistrict, '') ilike ${p} or p.name_th ilike ${p})`);
  }
  if (filters.transaction_type) clauses.push(`l.transaction_type = ${add(filters.transaction_type)}`);
  if (filters.property_type) clauses.push(`l.property_type = ${add(filters.property_type)}`);
  if (filters.province_slug) clauses.push(`p.slug = ${add(filters.province_slug)}`);
  if (filters.district?.trim()) clauses.push(`l.district ilike ${add(`%${filters.district.trim()}%`)}`);
  if (filters.min_price != null) {
    clauses.push(`(case when l.transaction_type = 'rent' then l.rent_price_monthly else l.total_price end) >= ${add(filters.min_price)}`);
  }
  if (filters.max_price != null) {
    clauses.push(`(case when l.transaction_type = 'rent' then l.rent_price_monthly else l.total_price end) <= ${add(filters.max_price)}`);
  }
  if (filters.min_price_per_rai != null) clauses.push(`l.price_per_rai >= ${add(filters.min_price_per_rai)}`);
  if (filters.max_price_per_rai != null) clauses.push(`l.price_per_rai <= ${add(filters.max_price_per_rai)}`);
  if (filters.min_size_rai != null) clauses.push(`l.size_rai >= ${add(filters.min_size_rai)}`);
  if (filters.max_size_rai != null) clauses.push(`l.size_rai <= ${add(filters.max_size_rai)}`);
  if (filters.zoning) clauses.push(`l.zoning = ${add(filters.zoning)}`);
  if (filters.eec != null) clauses.push(`l.is_eec = ${add(filters.eec)}`);

  const hasBounds = [filters.west, filters.south, filters.east, filters.north].every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (hasBounds) {
    clauses.push(`l.lng between ${add(filters.west)} and ${add(filters.east)}`);
    clauses.push(`l.lat between ${add(filters.south)} and ${add(filters.north)}`);
  }

  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const limitParam = add(limit);
  const offsetParam = add(offset);

  let rows: Record<string, unknown>[] = [];
  if (sql) {
    try {
      rows = (await sql.query(
        `${LAND_SELECT}
         where ${clauses.join(" and ")}
         group by l.id, p.id
         order by case when l.status = 'active' then 0 else 1 end,
                  l.is_featured desc,
                  l.created_at desc
         limit ${limitParam} offset ${offsetParam}`,
        params,
      )) as Record<string, unknown>[];
    } catch (error) {
      console.error("[searchProperties] database search failed; using canonical seed listings", error);
    }
  }

  const dbListings = rows.map(normalizeLand).map(enrichKnownListingCoordinates);
  if (offset > 0) return dbListings;

  const dbSlugs = new Set(dbListings.map((property) => property.slug));
  const matchingSeeds = SEED_PUBLIC_LISTINGS
    .filter((property) => !dbSlugs.has(property.slug))
    .filter((property) => propertyMatchesSearchFilters(property, filters));

  return [...dbListings, ...matchingSeeds].slice(0, limit);
}

export async function getListingBySlug(slug: string): Promise<Land | null> {
  const seed = SEED_PUBLIC_LISTINGS.find((property) => property.slug === slug) ?? null;
  const sql = getSqlIfConfigured();
  if (!sql) return seed;

  try {
    const rows = await sql.query(
      `${LAND_SELECT}
       where l.slug = $1 and l.status in ('active', 'sold') and l.deleted_at is null
       group by l.id, p.id
       limit 1`,
      [slug],
    );
    if (!rows[0]) return seed;

    const property = enrichKnownListingCoordinates(normalizeLand(rows[0]));
    if (!seed) return property;
    return {
      ...property,
      images: property.images?.length ? property.images : seed.images,
      province: property.province ?? seed.province,
    };
  } catch (error) {
    console.error("[getListingBySlug] database lookup failed; using canonical seed listing", error);
    return seed;
  }
}

export async function getLatestListings(limit = 6): Promise<Land[]> {
  return searchProperties({ limit: Math.min(Math.max(limit, 1), 24) });
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
