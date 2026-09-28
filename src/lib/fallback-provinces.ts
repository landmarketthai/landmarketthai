import type { Province } from "@/lib/types/database";

const FALLBACK_PROVINCES: Province[] = [
  { id: "fallback-rayong", name_th: "ระยอง", name_en: "Rayong", slug: "rayong", region: "EEC", lat: null, lng: null },
  { id: "fallback-chonburi", name_th: "ชลบุรี", name_en: "Chonburi", slug: "chonburi", region: "EEC", lat: null, lng: null },
  { id: "fallback-chachoengsao", name_th: "ฉะเชิงเทรา", name_en: "Chachoengsao", slug: "chachoengsao", region: "EEC", lat: null, lng: null },
  { id: "fallback-samut-prakan", name_th: "สมุทรปราการ", name_en: "Samut Prakan", slug: "samut-prakan", region: "Central", lat: null, lng: null },
  { id: "fallback-ayutthaya", name_th: "อยุธยา", name_en: "Ayutthaya", slug: "ayutthaya", region: "Central", lat: null, lng: null },
  { id: "fallback-bangkok", name_th: "กรุงเทพฯ", name_en: "Bangkok", slug: "bangkok", region: "Central", lat: null, lng: null },
];

export function getFallbackProvinceBySlug(slug: string): Province | null {
  return FALLBACK_PROVINCES.find((province) => province.slug === slug) ?? null;
}
