// Server-only Thailand administrative divisions lookup (province -> district -> subdistrict).
//
// Data: Open Admin Data — Thailand administrative divisions (2026.06), CC-BY-4.0.
// https://openadmindata.org/th/ · https://github.com/open-admin-data/thailand-administrative-divisions
// - src/data/thailand-flat.json: provinces + districts with approximate geo centers.
// - src/data/thailand-admin.json: province/district/subdistrict hierarchy (names only, no geo).
// Read lazily with fs so the ~3.7MB of JSON never enters a client bundle.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AdminArea {
  code: string;
  name_th: string;
  name_en: string;
  /** Approximate administrative center. Never use as a property's exact location. */
  lat: number | null;
  lng: number | null;
}

export interface AdminProvince extends AdminArea {
  districts: AdminDistrict[];
}

export interface AdminDistrict extends AdminArea {
  subdistricts: AdminArea[];
}

type Name = { local: string; en: string };
type FlatEntry = { id: string; level: number; name: Name; parent: { id: string } | null; geo?: { lat?: string; lon?: string } | null };
type TreeProvince = { id: string; district: { id: string; subdistrict: { id: string; name: Name }[] }[] };

const BANGKOK_NAME_TH = "กรุงเทพมหานคร";

// Legacy public.provinces names that differ from the official dataset name.
const PROVINCE_ALIASES: Record<string, string> = {
  "อยุธยา": "พระนครศรีอยุธยา",
  "กรุงเทพ": BANGKOK_NAME_TH,
  "กรุงเทพฯ": BANGKOK_NAME_TH,
};

const THAI = "th";
let cache: AdminProvince[] | null = null;

function coordinate(value: string | undefined): number | null {
  const parsed = value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readData<T>(file: string): T[] {
  const raw = readFileSync(join(process.cwd(), "src", "data", file), "utf8");
  return (JSON.parse(raw) as { data: T[] }).data;
}

export function loadThaiAdmin(): AdminProvince[] {
  if (cache) return cache;
  const flat = readData<FlatEntry>("thailand-flat.json");
  const tree = readData<TreeProvince>("thailand-admin.json");
  const subdistrictsByDistrict = new Map(tree.flatMap((province) => province.district.map((district) => [district.id, district.subdistrict] as const)));
  const area = (entry: FlatEntry): AdminArea => ({
    code: entry.id, name_th: entry.name.local.trim(), name_en: entry.name.en.trim(),
    lat: coordinate(entry.geo?.lat), lng: coordinate(entry.geo?.lon),
  });
  const byName = (a: AdminArea, b: AdminArea) => a.name_th.localeCompare(b.name_th, THAI);

  cache = flat.filter((entry) => entry.level === 1).map((province) => ({
    ...area(province),
    districts: flat
      .filter((entry) => entry.level === 2 && entry.parent?.id === province.id)
      .map((district) => {
        const center = area(district);
        return {
          ...center,
          // ponytail: dataset has no subdistrict geo, so subdistricts reuse the district center (map zooms closer instead).
          subdistricts: (subdistrictsByDistrict.get(district.id) ?? [])
            .map((sub) => ({ code: sub.id, name_th: sub.name.local.trim(), name_en: sub.name.en.trim(), lat: center.lat, lng: center.lng }))
            .sort(byName),
        };
      })
      .sort(byName),
  })).sort(byName);
  return cache;
}

function normalizeProvinceName(name: string): string {
  const trimmed = name.trim().replace(/^จังหวัด\s*/, "");
  return PROVINCE_ALIASES[trimmed] ?? trimmed;
}

export function findProvince(nameTh: string): AdminProvince | null {
  const name = normalizeProvinceName(nameTh);
  return loadThaiAdmin().find((province) => province.name_th === name) ?? null;
}

function strip(area: AdminArea): AdminArea {
  return { code: area.code, name_th: area.name_th, name_en: area.name_en, lat: area.lat, lng: area.lng };
}

export interface AdminOptions {
  province: AdminArea | null;
  districts: AdminArea[];
  district: AdminArea | null;
  subdistricts: AdminArea[];
}

/** Dependent dropdown options; district/subdistrict names are matched as stored on property_submissions. */
export function getAdminOptions(provinceNameTh: string, districtNameTh?: string | null): AdminOptions {
  const province = findProvince(provinceNameTh);
  if (!province) return { province: null, districts: [], district: null, subdistricts: [] };
  const districtName = districtNameTh?.trim().replace(/^(อำเภอ|เขต|อ\.)\s*/, "");
  const district = districtName ? province.districts.find((item) => item.name_th === districtName) ?? null : null;
  return {
    province: strip(province),
    districts: province.districts.map(strip),
    district: district ? strip(district) : null,
    subdistricts: district?.subdistricts ?? [],
  };
}
