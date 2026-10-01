import type { Land, LandType, ZoningColor } from "@/lib/types/database";
import { ZONING_LABELS, slugToLandType } from "@/lib/utils";

export interface LandFilters {
  province_slug?: string;
  land_type?: LandType;
  q?: string;
  size_min?: number;
  size_max?: number;
  price_min?: number;
  price_max?: number;
  zoning?: ZoningColor;
  is_eec?: boolean;
}

export type LandSearchInput = Record<string, string | string[] | undefined>;
const numericParams = { min_size: "size_min", max_size: "size_max", min_price: "price_min", max_price: "price_max" } as const;

export function parseLandSearchParams(input: LandSearchInput): LandFilters {
  const filters: LandFilters = {};
  const value = (key: string) => {
    const raw = input[key];
    if (Array.isArray(raw)) throw new Error(`Duplicate filter: ${key}`);
    return raw?.trim() ?? "";
  };
  const province = value("province");
  if (province) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(province) || province.length > 80) throw new Error("Invalid province");
    filters.province_slug = province;
  }
  const type = value("type");
  if (type) {
    const parsed = slugToLandType(type);
    if (!parsed) throw new Error("Invalid land type");
    filters.land_type = parsed;
  }
  const q = value("q");
  if (q) {
    if (q.length > 200) throw new Error("Search text must be at most 200 characters");
    filters.q = q;
  }
  for (const [param, field] of Object.entries(numericParams)) {
    const raw = value(param);
    if (!raw) continue;
    const number = Number(raw);
    if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(number) || number > 1e12) throw new Error(`Invalid number: ${param}`);
    filters[field as typeof numericParams[keyof typeof numericParams]] = number;
  }
  if (filters.size_min !== undefined && filters.size_max !== undefined && filters.size_min > filters.size_max) throw new Error("Minimum size exceeds maximum size");
  if (filters.price_min !== undefined && filters.price_max !== undefined && filters.price_min > filters.price_max) throw new Error("Minimum price exceeds maximum price");
  const zoning = value("zoning");
  if (zoning) {
    if (!Object.hasOwn(ZONING_LABELS, zoning)) throw new Error("Invalid zoning");
    filters.zoning = zoning as ZoningColor;
  }
  const eec = value("eec");
  if (eec) {
    if (eec !== "true" && eec !== "false") throw new Error("Invalid EEC filter");
    filters.is_eec = eec === "true";
  }
  return filters;
}

export function parseLandPage(raw?: string | string[]): number {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}

export function landSearchParams(filters: LandFilters, page = 1): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.province_slug) params.set("province", filters.province_slug);
  if (filters.land_type) params.set("type", filters.land_type);
  if (filters.q) params.set("q", filters.q);
  for (const [param, field] of Object.entries(numericParams)) {
    const value = filters[field as typeof numericParams[keyof typeof numericParams]];
    if (value !== undefined) params.set(param, String(value));
  }
  if (filters.zoning) params.set("zoning", filters.zoning);
  if (filters.is_eec !== undefined) params.set("eec", String(filters.is_eec));
  if (page > 1) params.set("page", String(page));
  return params;
}

export function matchesLandFilters(land: Land, filters: LandFilters = {}): boolean {
  return (!filters.province_slug || land.province?.slug === filters.province_slug)
    && (!filters.land_type || (filters.land_type === "eec" ? land.is_eec || land.land_type === "eec" : land.land_type === filters.land_type))
    && (!filters.q || [land.title_th, land.district, land.description].some(text => text?.toLocaleLowerCase().includes(filters.q!.toLocaleLowerCase())))
    && (filters.size_min === undefined || land.size_rai >= filters.size_min)
    && (filters.size_max === undefined || land.size_rai <= filters.size_max)
    && (filters.price_min === undefined || land.price_per_rai >= filters.price_min)
    && (filters.price_max === undefined || land.price_per_rai <= filters.price_max)
    && (!filters.zoning || land.zoning === filters.zoning)
    && (filters.is_eec === undefined || land.is_eec === filters.is_eec);
}
