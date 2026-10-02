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
  sortSeedListings,
} from "@/lib/seed-listings";
import { propertySqlOrder, sortPropertyResults } from "@/lib/marketplace/search-sort";
import { normalizeVerificationStatus } from "@/lib/marketplace/verification";
import {
  MAX_SEARCH_OFFSET,
  buildLocationOptions,
  collectOrderedMatches,
  propertyMatchesSearchFilters,
  propertySearchSqlClauses,
  type LocationOption,
  type PropertySearchFilters,
} from "@/lib/marketplace/search-filters";
export type { PropertySort } from "@/lib/marketplace/search-sort";
export type { LocationOption, PropertySearchFilters } from "@/lib/marketplace/search-filters";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // Neon returns timestamptz as Date; String(date) is locale-formatted and not reliably parseable in browsers.
  return value instanceof Date ? value.toISOString() : String(value);
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
    created_at: stringOrNull(row.created_at) ?? "",
  };
}

const LEGACY_LAND_CATEGORIES: readonly string[] = ["industrial", "eec", "logistics", "data_center", "investment"];

function normalizeLand(value: unknown): Land {
  const row = value as Record<string, unknown>;
  const images = Array.isArray(row.images) ? row.images.map(normalizeImage) : [];
  const landType = row.land_type as Land["land_type"];
  // lands_property_type_check limits property_type to the canonical set. Pre-V2 rows lack the
  // column; derive it from land_type, where legacy land categories (industrial/eec/...) are land.
  const propertyType = (typeof row.property_type === "string" && row.property_type
    ? row.property_type
    : landType && !LEGACY_LAND_CATEGORIES.includes(landType) ? landType : "land") as Land["property_type"];

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
    transaction_type: "sale",
    size_rai: numberOrNull(row.size_rai),
    area_rai: numberOrNull(row.area_rai),
    area_ngan: numberOrNull(row.area_ngan),
    area_sqwa: numberOrNull(row.area_sqwa),
    usable_area_sqm: numberOrNull(row.usable_area_sqm),
    zoning: row.zoning == null ? null : (row.zoning as Land["zoning"]),
    frontage_m: numberOrNull(row.frontage_m),
    depth_min_m: numberOrNull(row.depth_min_m),
    depth_max_m: numberOrNull(row.depth_max_m),
    road_name: stringOrNull(row.road_name),
    road_width_m: numberOrNull(row.road_width_m),
    price_per_rai: numberOrNull(row.price_per_rai),
    total_price: numberOrNull(row.total_price),
    referral_reward_max: numberOrNull(row.referral_reward_max),
    is_eec: Boolean(row.is_eec),
    nearby_landmarks: Array.isArray(row.nearby_landmarks) ? row.nearby_landmarks.map(String) : null,
    description: stringOrNull(row.description),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    location_precision: row.location_precision === "exact" ? "exact" : "approx",
    status: row.status as Land["status"],
    verification_status: normalizeVerificationStatus(row.verification_status),
    is_featured: Boolean(row.is_featured),
    seo_title: stringOrNull(row.seo_title),
    seo_description: stringOrNull(row.seo_description),
    published_at: stringOrNull(row.published_at),
    created_at: stringOrNull(row.created_at) ?? "",
    updated_at: stringOrNull(row.updated_at) ?? "",
    deleted_at: stringOrNull(row.deleted_at),
    verified_at: stringOrNull(row.verified_at),
    verified_by: null,
    title_deed_on_file: row.title_deed_on_file === true,
    province: normalizeProvince(row.province),
    images,
  };
}

const LAND_SELECT = `
  select
    l.*,
    to_jsonb(p.*) as province,
    exists (
      select 1 from land_documents d where d.land_id = l.id and d.doc_type = 'title_deed'
    ) as title_deed_on_file,
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
       where l.status in ('active', 'reserved', 'sold') and l.deleted_at is null
         and p.slug = $1 and l.land_type = $2
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc, l.id
       limit $3 offset $4`,
      [opts.province_slug, opts.land_type, limit, offset],
    );
  }

  if (opts?.province_slug) {
    return sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'reserved', 'sold') and l.deleted_at is null and p.slug = $1
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc, l.id
       limit $2 offset $3`,
      [opts.province_slug, limit, offset],
    );
  }

  if (opts?.land_type) {
    return sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'reserved', 'sold') and l.deleted_at is null and l.land_type = $1
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc, l.id
       limit $2 offset $3`,
      [opts.land_type, limit, offset],
    );
  }

  return sql.query(
    `${LAND_SELECT}
     where l.status in ('active', 'reserved', 'sold') and l.deleted_at is null
     group by l.id, p.id
     order by case when l.status = 'active' then 0 else 1 end, l.is_featured desc, l.created_at desc, l.id
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
    return rows.map(normalizeLand).map(enrichKnownListingCoordinates);
  },
  ["neon-public-listings-v2"],
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

  return getCachedPublicListings(
    opts?.province_slug ?? null,
    opts?.land_type ?? null,
    limit,
    offset,
  );
}

export async function getFeaturedListings(limit = 6): Promise<Land[]> {
  const sql = getSqlIfConfigured();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  let dbListings: Land[] = [];
  if (!sql) return sortSeedListings(SEED_PUBLIC_LISTINGS.filter(land => land.is_featured)).slice(0, safeLimit);

  if (sql) {
    const rows = await sql.query(
      `${LAND_SELECT}
       where l.status in ('active', 'reserved', 'sold') and l.deleted_at is null and l.is_featured = true
       group by l.id, p.id
       order by case when l.status = 'active' then 0 else 1 end, l.created_at desc, l.id
       limit $1`,
      [safeLimit],
    );
    dbListings = rows.map(normalizeLand);
  }

  return sortSeedListings(dbListings)
    .filter((land) => land.is_featured)
    .slice(0, safeLimit);
}

export async function getListingByRef(publicRef: number): Promise<Land | null> {
  const sql = getSqlIfConfigured();
  if (!sql) return null;

  const rows = await sql.query(
    `${LAND_SELECT}
     where l.public_ref = $1 and l.status in ('active', 'reserved', 'sold') and l.deleted_at is null
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
     order by l.is_featured desc, l.created_at desc, l.id
     limit $4`,
    [land.province_id, land.land_type, land.id, safeLimit],
  );

  return rows.map(normalizeLand);
}

export async function getPersistedProvinces(): Promise<Province[]> {
  const sql = getSqlIfConfigured();
  if (!sql) throw new Error("Province database unavailable");
  const rows = await sql`select * from provinces order by name_th`;
  return rows.map(normalizeProvince).filter((row): row is Province => Boolean(row) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row!.id));
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
    intended_use: null,
    budget_note: null,
    max_price: numberOrNull(row.max_price),
    max_price_per_rai: numberOrNull(row.max_price_per_rai),
    zoning: row.zoning == null ? null : row.zoning as BuyerDemand["zoning"],
    container_access: row.container_access == null ? null : row.container_access === true,
    high_voltage: row.high_voltage == null ? null : row.high_voltage === true,
    province_names: Array.isArray(row.province_names) ? row.province_names.map(String) : [],
    published_at: stringOrNull(row.published_at) ?? "",
    status: row.status as BuyerDemand["status"],
    is_public: Boolean(row.is_public),
    seo_title: null,
    seo_description: null,
    created_at: stringOrNull(row.created_at) ?? "",
    province: normalizeProvince(row.province),
  };
}

// Explicit allowlist: never select contact data, source IDs, review notes or user free text.
const PUBLIC_DEMAND_SELECT = `select d.id,d.slug,d.province_id,d.land_type,d.size_min_rai,d.size_max_rai,
  d.max_price,d.max_price_per_rai,d.zoning,d.container_access,d.high_voltage,
  d.status,d.is_public,d.published_at,d.created_at,
  case when p.id is null then null else jsonb_build_object(
    'id',p.id,'name_th',p.name_th,'name_en',p.name_en,'slug',p.slug,
    'region',p.region,'lat',p.lat,'lng',p.lng) end as province,
  array(select p2.name_th from provinces p2 where p2.id = any(d.province_ids) order by p2.name_th) as province_names
  from buyer_demand d left join provinces p on p.id = d.province_id`;
const PUBLIC_DEMAND_WHERE = `d.status = 'published' and d.is_public = true
  and d.buyer_requirement_id is not null and d.published_at is not null
  and d.reviewed_at is not null and d.reviewed_by = 'reviewed'
  and nullif(trim(d.slug), '') is not null`;

export async function getActiveDemands(limit = 20, offset = 0): Promise<BuyerDemand[]> {
  const sql = getSqlIfConfigured();
  if (!sql) throw new Error("Buyer demand database unavailable");

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 5000) : 20;
  const rows = await sql.query(
    `${PUBLIC_DEMAND_SELECT}
     where ${PUBLIC_DEMAND_WHERE}
     order by d.published_at desc,d.id
     limit $1 offset $2`,
    [safeLimit, Number.isSafeInteger(offset) && offset >= 0 ? offset : 0],
  );

  return rows.map(normalizeDemand);
}

export async function getDemandBySlug(slug: string): Promise<BuyerDemand | null> {
  const sql = getSqlIfConfigured();
  if (!sql) throw new Error("Buyer demand database unavailable");

  const rows = await sql.query(
    `${PUBLIC_DEMAND_SELECT}
     where ${PUBLIC_DEMAND_WHERE} and d.slug = $1
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
    created_at: stringOrNull(row.created_at) ?? "",
    updated_at: stringOrNull(row.updated_at) ?? "",
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

export async function searchProperties(filters: PropertySearchFilters = {}, options: { persistedOnly?: boolean } = {}): Promise<Land[]> {
  const sql = getSqlIfConfigured();
  if (options.persistedOnly && !sql) throw new Error("Property database unavailable");
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const offset = Math.min(Math.max(filters.offset ?? 0, 0), MAX_SEARCH_OFFSET);
  const needed = offset + limit;
  const seedSlugs = SEED_PUBLIC_LISTINGS.map((property) => property.slug);

  let dbMatches: Land[] = [];
  const dbSlugs = new Set<string>();
  if (sql) {
    try {
      const params: unknown[] = [];
      const add = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      // All predicates run in SQL (V2 columns via to_jsonb), ordered exactly like sortPropertyResults,
      // so paging candidates can never hide a match behind a fixed window.
      const where = propertySearchSqlClauses(filters, add, seedSlugs).join(" and ");
      const order = propertySqlOrder(filters.sort);
      const fetchPage = async (pageLimit: number, pageOffset: number) => {
        const rows = (await sql.query(
          `with page as (
             select l.id, row_number() over (order by ${order}) as rn
             from lands l join provinces p on p.id = l.province_id
             where ${where}
             order by ${order}
             limit ${pageLimit} offset ${pageOffset}
           )
           ${LAND_SELECT}
           join page on page.id = l.id
           group by l.id, p.id, page.rn
           order by page.rn`,
          params,
        )) as Record<string, unknown>[];
        return rows.map(normalizeLand).map(enrichKnownListingCoordinates);
      };
      const [matches, seedRows] = await Promise.all([
        // Page size covers the request plus every seed-backed row the in-memory re-check may drop.
        collectOrderedMatches(fetchPage, (property) => propertyMatchesSearchFilters(property, filters), needed, needed + seedSlugs.length),
        sql.query(
          `select slug from lands where slug = any($1::text[])`,
          [seedSlugs],
        ) as Promise<Record<string, unknown>[]>,
      ]);
      dbMatches = matches;
      for (const row of seedRows) dbSlugs.add(String(row.slug));
    } catch (error) {
      if (options.persistedOnly) throw error;
      console.error("[searchProperties] database search failed; using canonical seed listings", error);
      dbMatches = [];
      dbSlugs.clear();
    }
  }

  // A public DB row always replaces its canonical seed, even when the DB row does not match.
  const matchingSeeds = (options.persistedOnly ? [] : SEED_PUBLIC_LISTINGS)
    .filter((property) => !dbSlugs.has(property.slug))
    .filter((property) => propertyMatchesSearchFilters(property, filters));

  return sortPropertyResults([...dbMatches, ...matchingSeeds], filters.sort).slice(offset, offset + limit);
}

/** Province -> district -> subdistrict options taken only from public listing data. */
export async function getLocationOptions(): Promise<LocationOption[]> {
  const sql = getSqlIfConfigured();
  let rows: Record<string, unknown>[] = [];
  if (sql) {
    try {
      // to_jsonb keeps this query valid on schemas that predate the subdistrict column.
      rows = (await sql.query(
        `select distinct p.slug as province_slug, p.name_th as province_name,
           to_jsonb(l) ->> 'district' as district, to_jsonb(l) ->> 'subdistrict' as subdistrict
         from lands l join provinces p on p.id = l.province_id
         where l.status in ('active', 'sold') and l.deleted_at is null`,
        [],
      )) as Record<string, unknown>[];
    } catch (error) {
      console.error("[getLocationOptions] database lookup failed; using seed locations", error);
    }
  }
  return buildLocationOptions([
    ...rows.map((row) => ({
      province_slug: stringOrNull(row.province_slug),
      province_name: stringOrNull(row.province_name),
      district: stringOrNull(row.district),
      subdistrict: stringOrNull(row.subdistrict),
    })),
    ...SEED_PUBLIC_LISTINGS.map((property) => ({
      province_slug: property.province?.slug,
      province_name: property.province?.name_th,
      district: property.district,
      subdistrict: property.subdistrict,
    })),
  ]);
}

export async function getListingBySlug(slug: string): Promise<Land | null> {
  const seed = SEED_PUBLIC_LISTINGS.find((property) => property.slug === slug) ?? null;
  const sql = getSqlIfConfigured();
  if (!sql) return seed;

  try {
    const rows = await sql.query(
      `${LAND_SELECT}
       where l.slug = $1
       group by l.id, p.id
       limit 1`,
      [slug],
    );
    if (!rows[0]) return seed;
    const row = rows[0] as Record<string, unknown>;
    if (row.deleted_at || (row.status !== "active" && row.status !== "sold")) return null;

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
