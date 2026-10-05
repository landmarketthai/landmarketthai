import type { Land, LandType, PropertyType } from "@/lib/types/database";
import type { PropertySort } from "@/lib/marketplace/search-sort";
import { PROPERTY_TYPES } from "@/lib/marketplace/presentation";
import { slugToLandType } from "@/lib/utils";
export const PROPERTY_SORTS: readonly PropertySort[] = ["newest", "price_asc", "price_desc", "price_per_rai_asc", "size_desc"];
const ZONINGS = ["purple", "purple_light", "brown", "orange", "yellow", "green", "other"] as const;

export interface PropertySearchFilters {
  q?: string;
  property_type?: PropertyType;
  type?: LandType;
  status?: "active" | "sold";
  province_slug?: string;
  province_ids?: string[];
  location_terms?: string[];
  district?: string;
  subdistrict?: string;
  min_price?: number;
  max_price?: number;
  min_price_per_rai?: number;
  max_price_per_rai?: number;
  min_size_rai?: number;
  max_size_rai?: number;
  min_usable_area_sqm?: number;
  max_usable_area_sqm?: number;
  min_frontage_m?: number;
  min_depth_m?: number;
  min_road_width_m?: number;
  zoning?: string;
  eec?: boolean;
  location_precision?: "exact";
  sort?: PropertySort;
  west?: number;
  south?: number;
  east?: number;
  north?: number;
  limit?: number;
  offset?: number;
}

/** Single parser for /search page params and /api/properties/search query strings. */
export function parsePropertySearchParams(params: URLSearchParams): PropertySearchFilters {
  const text = (key: string) => params.get(key)?.trim() || undefined;
  const number = (key: string) => {
    const raw = params.get(key);
    if (!raw?.trim()) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const oneOf = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key);
    return allowed.includes(value as T) ? (value as T) : undefined;
  };
  const eec = params.get("eec");

  return {
    q: text("q"),
    property_type: oneOf("property_type", PROPERTY_TYPES),
    type: slugToLandType(params.get("type") ?? "") ?? undefined,
    status: oneOf("status", ["active", "sold"] as const) ?? (params.get("history") === "1" ? "sold" : undefined),
    province_slug: text("province"),
    district: text("district"),
    subdistrict: text("subdistrict"),
    min_price: number("min_price"),
    max_price: number("max_price"),
    min_price_per_rai: number("min_price_per_rai"),
    max_price_per_rai: number("max_price_per_rai"),
    min_size_rai: number("min_size_rai"),
    max_size_rai: number("max_size_rai"),
    min_usable_area_sqm: number("min_usable_area_sqm"),
    max_usable_area_sqm: number("max_usable_area_sqm"),
    min_frontage_m: number("min_frontage_m"),
    min_depth_m: number("min_depth_m"),
    min_road_width_m: number("min_road_width_m"),
    zoning: oneOf("zoning", ZONINGS),
    eec: eec === "1" ? true : eec === "0" ? false : undefined,
    location_precision: params.get("location_precision") === "exact" ? "exact" : undefined,
    sort: oneOf("sort", PROPERTY_SORTS),
    west: number("west"),
    south: number("south"),
    east: number("east"),
    north: number("north"),
    limit: Math.min(Math.max(number("limit") ?? 24, 1), 100),
    offset: Math.max(number("offset") ?? 0, 0),
  };
}

const THAI = "th-TH";

const positive = (value: number | null | undefined) => value != null && value > 0 ? value : null;

/** Building-only assets report usable area (sq.m.) but no land area; zero rai counts as no land area. */
export function isUsableAreaOnly(property: Pick<Land, "size_rai" | "usable_area_sqm">): boolean {
  return positive(property.size_rai) == null && positive(property.usable_area_sqm) != null;
}

export interface SizeCriteria {
  min_size_rai?: number | null;
  max_size_rai?: number | null;
  min_usable_area_sqm?: number | null;
  max_usable_area_sqm?: number | null;
}

/**
 * Rai and usable sq.m. are separate units and are never converted. Rai bounds do not apply to
 * building-only assets; usable-area bounds require a reported usable area (missing data fails).
 */
export function matchesSizeCriteria(property: Pick<Land, "size_rai" | "usable_area_sqm">, criteria: SizeCriteria): boolean {
  const within = (value: number | null | undefined, min?: number | null, max?: number | null) =>
    (min == null || (value != null && value >= min)) && (max == null || (value != null && value <= max));
  return (isUsableAreaOnly(property) || within(property.size_rai, criteria.min_size_rai, criteria.max_size_rai))
    && within(property.usable_area_sqm, criteria.min_usable_area_sqm, criteria.max_usable_area_sqm);
}

/** Strips administrative prefixes so "อ.นิคมพัฒนา จ.ระยอง" and "นิคมพัฒนา" compare equal. */
export function normalizeAreaName(value: string | null | undefined, provinceName?: string | null): string {
  let name = (value ?? "").trim();
  name = name.replace(/\s*(จ\.|จังหวัด)\s*\S+$/u, "");
  if (provinceName) name = name.replace(new RegExp(`\\s+${provinceName}$`, "u"), "");
  name = name.replace(/^(อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*/u, "");
  return name.trim();
}

function includesArea(value: string | null, filter: string, provinceName?: string | null): boolean {
  if (!value) return false;
  const haystack = normalizeAreaName(value, provinceName).toLocaleLowerCase(THAI);
  return haystack.includes(normalizeAreaName(filter, provinceName).toLocaleLowerCase(THAI));
}

/** Depth uses the deepest known measurement; listings without depth data never match. */
function propertyDepth(property: Land): number | null {
  return property.depth_max_m ?? property.depth_min_m;
}

export function propertyMatchesSearchFilters(property: Land, filters: PropertySearchFilters): boolean {
  if (filters.province_ids?.length && !filters.province_ids.includes(property.province_id)) return false;
  if (filters.location_terms?.length) {
    const text = [property.title_th, property.address, property.subdistrict, property.district, property.province?.name_th].filter(Boolean).join(" ").toLocaleLowerCase("th");
    if (!filters.location_terms.some((term) => text.includes(term.trim().toLocaleLowerCase("th")))) return false;
  }
  if (property.deleted_at || (property.status !== "active" && property.status !== "sold")) return false;
  if (property.transaction_type !== "sale") return false;

  const q = filters.q?.trim().toLocaleLowerCase(THAI);
  if (q) {
    // Free text also covers industrial-estate / landmark text already stored on the listing.
    const haystack = [
      property.title_th,
      property.address,
      property.subdistrict,
      property.district,
      property.road_name,
      property.province?.name_th,
      property.province?.name_en,
      ...(property.nearby_landmarks ?? []),
      property.description,
    ].filter(Boolean).join(" ").toLocaleLowerCase(THAI);
    if (!haystack.includes(q)) return false;
  }
  const provinceName = property.province?.name_th;
  if (filters.property_type && property.property_type !== filters.property_type) return false;
  if (filters.type && property.land_type !== filters.type && !(filters.type === "eec" && property.is_eec)) return false;
  if (filters.status && property.status !== filters.status) return false;
  if (filters.province_slug && property.province?.slug !== filters.province_slug) return false;
  if (filters.district && !includesArea(property.district, filters.district, provinceName)) return false;
  // Legacy rows sometimes store "อำเภอ ต.ตำบล" in district; fall back to that text when subdistrict is empty.
  if (filters.subdistrict && !includesArea(property.subdistrict ?? property.district, filters.subdistrict, provinceName)) return false;

  const atLeast = (value: number | null, min?: number) => min == null || (value != null && value >= min);
  const atMost = (value: number | null, max?: number) => max == null || (value != null && value <= max);
  if (!atLeast(property.total_price, filters.min_price) || !atMost(property.total_price, filters.max_price)) return false;
  if (!isUsableAreaOnly(property) && (!atLeast(property.price_per_rai, filters.min_price_per_rai) || !atMost(property.price_per_rai, filters.max_price_per_rai))) return false;
  if (!matchesSizeCriteria(property, filters)) return false;
  if (!atLeast(property.frontage_m, filters.min_frontage_m)) return false;
  if (!atLeast(propertyDepth(property), filters.min_depth_m)) return false;
  if (!atLeast(property.road_width_m, filters.min_road_width_m)) return false;
  if (filters.zoning && property.zoning !== filters.zoning) return false;
  if (filters.eec != null && property.is_eec !== filters.eec) return false;
  if (filters.location_precision === "exact" && (property.location_precision !== "exact" || property.lat == null || property.lng == null)) return false;

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

export interface LocationOption {
  province_slug: string;
  district: string;
  subdistrict: string | null;
}

/** Province -> district -> subdistrict options built only from values present on public listings. */
export function buildLocationOptions(rows: Array<{
  province_slug: string | null | undefined;
  province_name?: string | null;
  district: string | null;
  subdistrict: string | null;
}>): LocationOption[] {
  const seen = new Set<string>();
  const options: LocationOption[] = [];
  for (const row of rows) {
    // Split legacy "กบินทร์บุรี ต.หนองกี่" district text into its two stored levels.
    const embedded = row.district?.match(/^(.*?)\s+(?:ต\.|ตำบล)\s*(\S.*)$/u);
    const district = normalizeAreaName(embedded ? embedded[1] : row.district, row.province_name);
    if (!row.province_slug || !district) continue;
    const subdistrict = normalizeAreaName(row.subdistrict ?? embedded?.[2], row.province_name) || null;
    const key = `${row.province_slug}|${district}|${subdistrict ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ province_slug: row.province_slug, district, subdistrict });
  }
  return options.sort((a, b) =>
    a.province_slug.localeCompare(b.province_slug) || a.district.localeCompare(b.district, THAI) || (a.subdistrict ?? "").localeCompare(b.subdistrict ?? "", THAI),
  );
}

export const MAX_SEARCH_OFFSET = 1000;

// Marketplace V2 columns may not exist yet on the production schema; reading them through
// to_jsonb(l) yields null instead of a SQL error. Base columns are referenced directly.
const v2Text = (column: string) => `(to_jsonb(l) ->> '${column}')`;
const v2Number = (column: string) => `(to_jsonb(l) ->> '${column}')::numeric`;
const nonEmpty = (expression: string) => `nullif(${expression}, '')`;

/**
 * SQL WHERE clauses equivalent to propertyMatchesSearchFilters for DB rows. The only intentional
 * superset is seed-backed slugs on coordinate predicates, because their coordinates may be filled
 * from the canonical seed after the query; the in-memory filter re-checks every fetched row.
 */
export function propertySearchSqlClauses(
  filters: PropertySearchFilters,
  add: (value: unknown) => string,
  seedSlugs: readonly string[],
): string[] {
  const clauses = [
    "l.status in ('active', 'sold')",
    "l.deleted_at is null",
    `coalesce(${v2Text("transaction_type")}, 'sale') = 'sale'`,
  ];

  const q = filters.q?.trim();
  if (q) {
    const haystack = `concat_ws(' ', ${[
      "l.title_th", v2Text("address"), v2Text("subdistrict"), "l.district", v2Text("road_name"),
      "p.name_th", "p.name_en", "array_to_string(array_remove(l.nearby_landmarks, ''), ' ')", "l.description",
    ].map(nonEmpty).join(", ")})`;
    clauses.push(`strpos(lower(${haystack}), lower(${add(q)})) > 0`);
  }
  if (filters.property_type) {
    // Mirrors normalizeLand: explicit unknown types are other; only missing types use legacy land categories.
    const canonical = add([...PROPERTY_TYPES]);
    clauses.push(`(case when ${v2Text("property_type")} = any(${canonical}::text[]) then ${v2Text("property_type")}
      when nullif(${v2Text("property_type")}, '') is not null then 'other'
      when l.land_type::text = any(${canonical}::text[]) then l.land_type::text
      when l.land_type is null or l.land_type::text in ('industrial','eec','logistics','data_center','investment') then 'land' else 'other' end) = ${add(filters.property_type)}`);
  }
  if (filters.type) clauses.push(filters.type === "eec"
    ? `(l.land_type::text = ${add(filters.type)} or l.is_eec = true)`
    : `l.land_type::text = ${add(filters.type)}`);
  if (filters.status) clauses.push(`l.status = ${add(filters.status)}`);
  if (filters.province_ids?.length) clauses.push(`l.province_id = any(${add(filters.province_ids)}::uuid[])`);
  if (filters.location_terms?.length) {
    const text = `lower(concat_ws(' ', l.title_th, ${v2Text("address")}, ${v2Text("subdistrict")}, l.district, p.name_th))`;
    clauses.push(`(${filters.location_terms.map((term) => `strpos(${text}, lower(${add(term.trim())})) > 0`).join(" or ")})`);
  }
  if (filters.province_slug) clauses.push(`p.slug = ${add(filters.province_slug)}`);
  // Raw text contains the normalized text, so matching the normalized filter against it never drops a match.
  const area = (column: string, filter: string) =>
    `strpos(lower(${column}), lower(regexp_replace(${add(normalizeAreaName(filter))}, '\s+' || p.name_th || '$', ''))) > 0`;
  if (filters.district) clauses.push(area("l.district", filters.district));
  if (filters.subdistrict) clauses.push(area(`coalesce(${v2Text("subdistrict")}, l.district)`, filters.subdistrict));

  const range = (column: string, min?: number, max?: number) => {
    if (min != null) clauses.push(`${column} >= ${add(min)}`);
    if (max != null) clauses.push(`${column} <= ${add(max)}`);
  };
  range("l.total_price", filters.min_price, filters.max_price);
  // Mirrors matchesSizeCriteria: rai bounds skip building-only rows; sq.m. bounds need a usable area.
  const usableArea = v2Number("usable_area_sqm");
  const perRaiBounds = [
    filters.min_price_per_rai != null && `l.price_per_rai >= ${add(filters.min_price_per_rai)}`,
    filters.max_price_per_rai != null && `l.price_per_rai <= ${add(filters.max_price_per_rai)}`,
  ].filter(Boolean);
  if (perRaiBounds.length) {
    clauses.push(`((coalesce(l.size_rai, 0) <= 0 and coalesce(${usableArea}, 0) > 0) or (${perRaiBounds.join(" and ")}))`);
  }
  const raiBounds = [
    filters.min_size_rai != null && `l.size_rai >= ${add(filters.min_size_rai)}`,
    filters.max_size_rai != null && `l.size_rai <= ${add(filters.max_size_rai)}`,
  ].filter(Boolean);
  if (raiBounds.length) {
    clauses.push(`((coalesce(l.size_rai, 0) <= 0 and coalesce(${usableArea}, 0) > 0) or (${raiBounds.join(" and ")}))`);
  }
  range(usableArea, filters.min_usable_area_sqm, filters.max_usable_area_sqm);
  range("l.frontage_m", filters.min_frontage_m);
  range(`coalesce(${v2Number("depth_max_m")}, ${v2Number("depth_min_m")})`, filters.min_depth_m);
  range(v2Number("road_width_m"), filters.min_road_width_m);
  if (filters.zoning) clauses.push(`l.zoning::text = ${add(filters.zoning)}`);
  if (filters.eec != null) clauses.push(`l.is_eec = ${add(filters.eec)}`);

  const seedOr = (clause: string) => seedSlugs.length ? `(${clause} or l.slug = any(${add([...seedSlugs])}::text[]))` : clause;
  if (filters.location_precision === "exact") {
    clauses.push(seedOr("l.location_precision::text = 'exact' and l.lat is not null and l.lng is not null"));
  }
  const hasBounds = [filters.west, filters.south, filters.east, filters.north].every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (hasBounds) {
    clauses.push(seedOr(`l.lng between ${add(filters.west)} and ${add(filters.east)} and l.lat between ${add(filters.south)} and ${add(filters.north)}`));
  }
  return clauses;
}

/**
 * Pages through DB candidates (already in final sort order) until `needed` rows pass `matches`
 * or the DB is exhausted. Memory is bounded by `needed + pageSize`, never by inventory size.
 */
export async function collectOrderedMatches<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  matches: (row: T) => boolean,
  needed: number,
  pageSize: number,
): Promise<T[]> {
  const found: T[] = [];
  for (let offset = 0; found.length < needed; offset += pageSize) {
    const page = await fetchPage(pageSize, offset);
    for (const row of page) if (matches(row) && found.length < needed) found.push(row);
    if (page.length < pageSize) break;
  }
  return found;
}

/**
 * Strict Province -> District -> Subdistrict choices from real listing data: no districts until a
 * province is chosen, no subdistricts until a district is chosen. Current values stay selectable.
 */
export function locationChoices(
  options: readonly LocationOption[],
  selected: { province?: string; district?: string; subdistrict?: string },
): { districts: string[]; subdistricts: string[] } {
  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, THAI));
  const inProvince = selected.province ? options.filter((option) => option.province_slug === selected.province) : [];
  return {
    districts: selected.province ? unique([...inProvince.map((option) => option.district), selected.district]) : [],
    subdistricts: selected.province && selected.district
      ? unique([...inProvince.filter((option) => option.district === selected.district).map((option) => option.subdistrict), selected.subdistrict])
      : [],
  };
}
