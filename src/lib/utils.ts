import type { Land, LandType, ZoningColor } from "./types/database";
import { PROPERTY_TYPE_LABELS } from "@/lib/marketplace/presentation";

/** Labels for every stored land_type (legacy categories + canonical property types). */
export const LAND_TYPE_LABELS: Record<LandType, string> = {
  ...PROPERTY_TYPE_LABELS,
  industrial: "ที่ดินอุตสาหกรรม",
  eec: "EEC",
  logistics: "โลจิสติกส์",
  data_center: "Data Center",
  investment: "ที่ดินลงทุน",
};

/** Land categories with /land/[province]/[type] SEO pages, filters and lead-form choices. Unchanged by new property types. */
export const LAND_CATEGORY_TYPES = ["land", "industrial", "eec", "factory", "warehouse", "logistics", "data_center", "investment"] as const satisfies readonly LandType[];

export const ZONING_LABELS: Record<ZoningColor, string> = {
  purple: "ม่วง (อุตสาหกรรม)",
  purple_light: "ม่วงอ่อน",
  brown: "น้ำตาล",
  orange: "ส้ม",
  yellow: "เหลือง",
  green: "เขียว",
  other: "อื่นๆ",
};

export const ZONING_COLORS: Record<ZoningColor, string> = {
  purple: "#7C3AED",
  purple_light: "#A78BFA",
  brown: "#92400E",
  orange: "#EA580C",
  yellow: "#CA8A04",
  green: "#16A34A",
  other: "#6B7280",
};

export function formatRai(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}k ไร่`;
  return `${n.toLocaleString("th-TH", { maximumFractionDigits: 5 })} ไร่`;
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : Number(m.toFixed(2)).toString()} ล้าน`;
  }
  return n.toLocaleString("th-TH");
}

export function formatMoneyFull(n: number): string {
  return `${n.toLocaleString("th-TH")} บาท`;
}

export function listingStatusLabel(land: Pick<Land, "status" | "transaction_type">): string {
  if (land.status === "sold") return "ขายแล้ว";
  if (land.status === "reserved") return "จองแล้ว";
  if (land.status === "active") return "พร้อมขาย";
  return land.status;
}

export function formatUpdatedDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function listingHref(_publicRef: number, slug: string): string {
  return `/property/${slug}`;
}

export function provinceHref(provinceSlug: string): string {
  return `/land/${provinceSlug}`;
}

export function typeHref(provinceSlug: string, typeSlug: string): string {
  return `/land/${provinceSlug}/${typeSlug}`;
}

export function landTypeSlug(type: LandType): string {
  return type.replace(/_/g, "-");
}

export function slugToLandType(slug: string): LandType | null {
  const t = slug.replace(/-/g, "_") as LandType;
  if ((LAND_CATEGORY_TYPES as readonly LandType[]).includes(t)) return t;
  return null;
}

export function cdnUrl(storageKey: string): string {
  const base =
    process.env.NEXT_PUBLIC_CDN_BASE ??
    process.env.DO_SPACES_CDN_BASE ??
    "";
  return `${base}/${storageKey}`;
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
