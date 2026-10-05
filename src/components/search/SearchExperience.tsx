"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, Map as MapIcon, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import type { Geometry } from "geojson";
import type { Land, PropertyType, Province } from "@/lib/types/database";
import { formatMoneyFull, listingStatusLabel } from "@/lib/utils";
import { verificationBadges } from "@/lib/marketplace/verification";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, propertySizeLabel } from "@/lib/marketplace/presentation";
import { locationChoices, type LocationOption } from "@/lib/marketplace/search-filters";
import { areaFromText, type AreaIndex } from "@/lib/area-text";
import PropertyMap, { type MapBounds } from "./PropertyMap";
import SearchPropertyCard from "./SearchPropertyCard";

export interface SearchValues {
  q?: string;
  property_type?: PropertyType;
  status?: "active" | "sold";
  province?: string;
  district?: string;
  subdistrict?: string;
  min_price?: string;
  max_price?: string;
  min_price_per_rai?: string;
  max_price_per_rai?: string;
  min_size_rai?: string;
  max_size_rai?: string;
  min_usable_area_sqm?: string;
  max_usable_area_sqm?: string;
  min_frontage_m?: string;
  min_depth_m?: string;
  min_road_width_m?: string;
  zoning?: string;
  eec?: boolean;
  location_precision?: "exact";
  sort?: "newest" | "price_asc" | "price_desc" | "price_per_rai_asc" | "size_desc";
}

interface Props {
  initialProperties: Land[];
  provinces: Province[];
  /** Province slug -> admin code for /geo/th/<code>.json boundary files. */
  provinceCodes?: Record<string, string>;
  locationOptions: LocationOption[];
  initialValues: SearchValues;
  initialMode?: "list" | "map";
}

const propertyTypes: ReadonlyArray<readonly [string, string]> = [["", "ทั้งหมด"], ...PROPERTY_TYPES.map((type) => [type, PROPERTY_TYPE_LABELS[type]] as const)];

const zoningOptions = [
  ["", "ทุกผังเมือง"],
  ["purple", "ม่วง (อุตสาหกรรม)"],
  ["purple_light", "ม่วงอ่อน"],
  ["brown", "น้ำตาล"],
  ["orange", "ส้ม"],
  ["yellow", "เหลือง"],
  ["green", "เขียว"],
  ["other", "อื่นๆ"],
] as const;

const sortOptions: Array<[NonNullable<SearchValues["sort"]>, string]> = [
  ["newest", "อัปเดตล่าสุด"],
  ["price_asc", "ราคารวม: ต่ำ → สูง"],
  ["price_desc", "ราคารวม: สูง → ต่ำ"],
  ["price_per_rai_asc", "ราคา/ไร่: ต่ำ → สูง"],
  ["size_desc", "ขนาด: มาก → น้อย"],
];

type BoundaryFile = { p: Geometry; d: Record<string, Geometry>; s?: Record<string, string[]> };
const boundaryCache = new Map<string, Promise<BoundaryFile | null>>();

/** Loads /geo/th/<code>.json once per province; null while loading or when unavailable. */
function useAdminBoundaries(code: string | undefined) {
  const [loaded, setLoaded] = useState<{ code: string; file: BoundaryFile | null } | null>(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    if (!boundaryCache.has(code)) {
      boundaryCache.set(code, fetch(`/geo/th/${code}.json`).then((response) => response.ok ? response.json() : null).catch(() => null));
    }
    void boundaryCache.get(code)!.then((file) => { if (!cancelled) setLoaded({ code, file }); });
    return () => { cancelled = true; };
  }, [code]);
  return code && loaded?.code === code ? loaded.file : null;
}

let areaIndex: Promise<AreaIndex | null> | null = null;

/** Loads the province/district name index only once someone types a search. */
function useAreaIndex(enabled: boolean) {
  const [index, setIndex] = useState<AreaIndex | null>(null);
  useEffect(() => {
    if (!enabled || index) return;
    let cancelled = false;
    areaIndex ??= fetch("/geo/th/index.json").then((response) => response.ok ? response.json() : null).catch(() => null);
    void areaIndex.then((loaded) => { if (!cancelled) setIndex(loaded); });
    return () => { cancelled = true; };
  }, [enabled, index]);
  return index;
}

function paramsFromValues(values: SearchValues) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, value === true ? "1" : String(value));
  }
  return params;
}

export default function SearchExperience({ initialProperties, provinces, provinceCodes = {}, locationOptions, initialValues, initialMode = "list" }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<SearchValues>(initialValues);
  const [properties, setProperties] = useState(initialProperties);
  const [fitKey, setFitKey] = useState(0);
  // Dropdowns win; otherwise a province/district typed in the search box ("ระยอง", "อ.บางพลี") draws the outline.
  const index = useAreaIndex(!values.province && Boolean(values.q?.trim()));
  const typedArea = !values.province && index ? areaFromText(values.q, index) : null;
  const boundaryFile = useAdminBoundaries(values.province ? provinceCodes[values.province] : typedArea?.code);
  const { districts: listingDistricts, subdistricts: listingSubdistricts } = useMemo(
    () => locationChoices(locationOptions, values),
    [locationOptions, values],
  );
  // Every official district is selectable once its province boundary file loads, not only districts with listings.
  const districtOptions = useMemo(
    () => [...new Set([...listingDistricts, ...Object.keys(boundaryFile?.d ?? {})])].sort((a, b) => a.localeCompare(b, "th")),
    [listingDistricts, boundaryFile],
  );
  const subdistrictOptions = useMemo(
    () => [...new Set([...listingSubdistricts, ...(values.district && values.province ? boundaryFile?.s?.[values.district] ?? [] : [])])].sort((a, b) => a.localeCompare(b, "th")),
    [listingSubdistricts, boundaryFile, values.district, values.province],
  );
  const district = values.province ? values.district : typedArea?.district;
  const boundary = boundaryFile ? (district ? boundaryFile.d[district] : boundaryFile.p) ?? null : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"list" | "map">(initialMode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchOnMove, setSearchOnMove] = useState(true);
  const [loading, setLoading] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const boundsRequestRef = useRef(false);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!searchOnMove) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (boundsRequestRef.current) {
        requestRef.current?.abort();
        setLoading(false);
      }
    }
  }, [searchOnMove]);

  const visibleMapProperties = useMemo(
    () => properties.filter((property) => property.lat != null && property.lng != null),
    [properties],
  );
  const selectedMapProperty = useMemo(
    () => properties.find((property) => property.id === selectedId) ?? null,
    [properties, selectedId],
  );

  const activeFilters = useMemo(() => {
    const items: Array<{ key: keyof SearchValues; label: string }> = [];
    const numberLabel = (value?: string) => {
      if (!value) return "";
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed.toLocaleString("th-TH") : value;
    };
    const province = provinces.find((item) => item.slug === values.province);
    const zoning = zoningOptions.find(([value]) => value === values.zoning)?.[1];

    if (values.q) items.push({ key: "q", label: `คำค้น: ${values.q}` });
    if (values.property_type) items.push({ key: "property_type", label: propertyTypes.find(([value]) => value === values.property_type)?.[1] ?? values.property_type });
    if (values.status) items.push({ key: "status", label: values.status === "active" ? "พร้อมขาย" : "ขายแล้ว" });
    if (values.province) items.push({ key: "province", label: province?.name_th ?? values.province });
    if (values.district) items.push({ key: "district", label: `อำเภอ: ${values.district}` });
    if (values.subdistrict) items.push({ key: "subdistrict", label: `ตำบล: ${values.subdistrict}` });
    if (values.min_price) items.push({ key: "min_price", label: `ราคา ≥ ${numberLabel(values.min_price)}` });
    if (values.max_price) items.push({ key: "max_price", label: `ราคา ≤ ${numberLabel(values.max_price)}` });
    if (values.min_price_per_rai) items.push({ key: "min_price_per_rai", label: `บาท/ไร่ ≥ ${numberLabel(values.min_price_per_rai)}` });
    if (values.max_price_per_rai) items.push({ key: "max_price_per_rai", label: `บาท/ไร่ ≤ ${numberLabel(values.max_price_per_rai)}` });
    if (values.min_size_rai) items.push({ key: "min_size_rai", label: `ขนาด ≥ ${numberLabel(values.min_size_rai)} ไร่` });
    if (values.max_size_rai) items.push({ key: "max_size_rai", label: `ขนาด ≤ ${numberLabel(values.max_size_rai)} ไร่` });
    if (values.min_usable_area_sqm) items.push({ key: "min_usable_area_sqm", label: `พื้นที่ใช้สอย ≥ ${numberLabel(values.min_usable_area_sqm)} ตร.ม.` });
    if (values.max_usable_area_sqm) items.push({ key: "max_usable_area_sqm", label: `พื้นที่ใช้สอย ≤ ${numberLabel(values.max_usable_area_sqm)} ตร.ม.` });
    if (values.min_frontage_m) items.push({ key: "min_frontage_m", label: `หน้ากว้าง ≥ ${numberLabel(values.min_frontage_m)} ม.` });
    if (values.min_depth_m) items.push({ key: "min_depth_m", label: `ความลึก ≥ ${numberLabel(values.min_depth_m)} ม.` });
    if (values.min_road_width_m) items.push({ key: "min_road_width_m", label: `ถนน ≥ ${numberLabel(values.min_road_width_m)} ม.` });
    if (values.zoning) items.push({ key: "zoning", label: zoning ?? values.zoning });
    if (values.eec) items.push({ key: "eec", label: "EEC" });
    if (values.location_precision === "exact") items.push({ key: "location_precision", label: "พิกัดแบบ Exact" });
    return items;
  }, [provinces, values]);

  const fetchResults = useCallback(async (nextValues: SearchValues, bounds?: MapBounds) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    boundsRequestRef.current = !!bounds;
    const params = paramsFromValues(nextValues);
    params.set("limit", bounds ? "100" : "24");
    if (bounds) {
      params.set("west", String(bounds.west));
      params.set("south", String(bounds.south));
      params.set("east", String(bounds.east));
      params.set("north", String(bounds.north));
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/properties/search?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) return;
      const body = (await response.json()) as { properties?: Land[] };
      if (controller.signal.aborted) return;
      setProperties(body.properties ?? []);
      if (!bounds) setFitKey((key) => key + 1);
      setSelectedId(null);
      setHoveredId(null);
    } catch (error) {
      if (!controller.signal.aborted) console.error("Property search failed:", error);
    } finally {
      if (requestRef.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  function applyValues(nextValues: SearchValues) {
    setValues(nextValues);
    const params = paramsFromValues(nextValues);
    router.replace(params.size ? `/search?${params.toString()}` : "/search", { scroll: false });
    void fetchResults(nextValues);
  }

  function applyFilters() {
    applyValues(values);
  }

  function clearFilters() {
    applyValues({});
  }

  function removeFilter(key: keyof SearchValues) {
    const nextValues = { ...values, [key]: undefined };
    // Location filters are hierarchical: dropping a parent drops its children.
    if (key === "province") nextValues.district = undefined;
    if (key === "province" || key === "district") nextValues.subdistrict = undefined;
    applyValues(nextValues);
  }

  function changeSort(sort: NonNullable<SearchValues["sort"]>) {
    applyValues({ ...values, sort: sort === "newest" ? undefined : sort });
  }

  function selectProperty(id: string, fromMap = false) {
    setSelectedId(id);
    if (!fromMap || !window.matchMedia("(min-width: 1024px)").matches) return;
    setTimeout(() => {
      const card = cardRefs.current.get(id);
      if (!card) return;
      card.scrollIntoView({ block: "center" });
    }, 0);
  }

  function handleBoundsChange(bounds: MapBounds) {
    if (!searchOnMove) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop && mobileMode !== "map") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // A queued user search already supersedes the previous response.
    requestRef.current?.abort();
    boundsRequestRef.current = true;
    debounceRef.current = setTimeout(() => void fetchResults(values, bounds), 350);
  }

  const buyerHref = `/buy-request${paramsFromValues(values).size ? `?${paramsFromValues(values).toString()}` : ""}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="bg-[#071d4a] px-4 py-6 text-white sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">ค้นหาอสังหาริมทรัพย์</h1>
              <p className="mt-1 text-sm text-blue-100">ผลลัพธ์และตำแหน่งบนแผนที่มาจากข้อมูลจริงที่เผยแพร่ในระบบ</p>
            </div>
            <Link href="/buy-request" className="text-sm font-semibold text-white underline-offset-4 hover:underline">ยังไม่เจอทรัพย์? ฝากเงื่อนไข ›</Link>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[minmax(260px,1.4fr)_160px_180px_auto]">
            <label className="relative col-span-2 lg:col-span-1">
              <span className="sr-only">ค้นหาทำเล</span>
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={values.q ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, q: event.target.value || undefined }))}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
                className="input pl-10"
                placeholder="จังหวัด / อำเภอ / ตำบล / นิคม / ทำเล"
              />
            </label>
            <select
              className="input"
              value={values.property_type ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, property_type: (event.target.value || undefined) as SearchValues["property_type"], ...(event.target.value === "land" ? { min_usable_area_sqm: undefined, max_usable_area_sqm: undefined } : {}) }))}
            >
              {propertyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              className="input col-span-2 min-[420px]:col-span-1 lg:col-span-1"
              value={values.province ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, province: event.target.value || undefined, district: undefined, subdistrict: undefined }))}
            >
              <option value="">ทุกจังหวัด</option>
              {provinces.map((province) => <option key={province.id} value={province.slug}>{province.name_th}</option>)}
            </select>
            <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-1 lg:flex">
              <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="btn-outline justify-center px-3" aria-expanded={advancedOpen}>
                <SlidersHorizontal size={17} />
                <span>ตัวกรอง</span>
              </button>
              <button type="button" onClick={applyFilters} className="btn-green px-5">ค้นหา</button>
            </div>
          </div>

          {advancedOpen && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-3">
                <div className="text-sm font-bold text-slate-800">ตัวกรองสำหรับที่ดินอุตสาหกรรม</div>
                <div className="mt-0.5 text-xs text-slate-500">ระบบจะแสดงเฉพาะเงื่อนไขที่มีข้อมูลจริงในประกาศ</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <select className="input" aria-label="อำเภอ" value={values.district ?? ""} disabled={!districtOptions.length} onChange={(e) => setValues((v) => ({ ...v, district: e.target.value || undefined, subdistrict: undefined }))}>
                  <option value="">{!values.province ? "เลือกจังหวัดก่อน" : districtOptions.length ? "ทุกอำเภอ" : "ยังไม่มีข้อมูลอำเภอ"}</option>
                  {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
                </select>
                <select className="input" aria-label="ตำบล" value={values.subdistrict ?? ""} disabled={!subdistrictOptions.length} onChange={(e) => setValues((v) => ({ ...v, subdistrict: e.target.value || undefined }))}>
                  <option value="">{!values.district ? "เลือกอำเภอก่อน" : subdistrictOptions.length ? "ทุกตำบล" : "ยังไม่มีข้อมูลตำบล"}</option>
                  {subdistrictOptions.map((subdistrict) => <option key={subdistrict} value={subdistrict}>{subdistrict}</option>)}
                </select>
                <select className="input" value={values.status ?? ""} onChange={(e) => setValues((v) => ({ ...v, status: (e.target.value || undefined) as SearchValues["status"] }))}>
                  <option value="">ทุกสถานะ</option>
                  <option value="active">พร้อมขาย</option>
                  <option value="sold">ขายแล้ว</option>
                </select>
                <input className="input" inputMode="decimal" placeholder="ราคาต่ำสุด" value={values.min_price ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_price: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="ราคาสูงสุด" value={values.max_price ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_price: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="บาท/ไร่ ต่ำสุด" value={values.min_price_per_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_price_per_rai: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="บาท/ไร่ สูงสุด" value={values.max_price_per_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_price_per_rai: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="ขนาดต่ำสุด (ไร่)" value={values.min_size_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_size_rai: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="ขนาดสูงสุด (ไร่)" value={values.max_size_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_size_rai: e.target.value || undefined }))} />
                {(!values.property_type || values.property_type !== "land") && ([['min_usable_area_sqm', 'พื้นที่ใช้สอยต่ำสุด (ตร.ม.)'], ['max_usable_area_sqm', 'พื้นที่ใช้สอยสูงสุด (ตร.ม.)']] as const).map(([name, label]) => <input key={name} aria-label={label} type="number" min="0" step="0.01" className="input" placeholder={label} value={values[name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value || undefined }))} />)}
                <input className="input" inputMode="decimal" placeholder="หน้ากว้างอย่างน้อย (ม.)" value={values.min_frontage_m ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_frontage_m: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="ความลึกอย่างน้อย (ม.)" value={values.min_depth_m ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_depth_m: e.target.value || undefined }))} />
                <input className="input" inputMode="decimal" placeholder="ถนนกว้างอย่างน้อย (ม.)" value={values.min_road_width_m ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_road_width_m: e.target.value || undefined }))} />
                <select className="input" value={values.zoning ?? ""} onChange={(e) => setValues((v) => ({ ...v, zoning: e.target.value || undefined }))}>
                  {zoningOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <input type="checkbox" checked={values.eec ?? false} onChange={(e) => setValues((v) => ({ ...v, eec: e.target.checked || undefined }))} />
                  EEC เท่านั้น
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <input type="checkbox" checked={values.location_precision === "exact"} onChange={(e) => setValues((v) => ({ ...v, location_precision: e.target.checked ? "exact" : undefined }))} />
                  เฉพาะพิกัดแบบ Exact
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={applyFilters} className="btn-green min-w-32 justify-center">ใช้ตัวกรอง</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="text-sm text-slate-600">
              {loading ? "กำลังค้นหา..." : `พบ ${properties.length.toLocaleString("th-TH")} ทรัพย์`}
              {visibleMapProperties.length < properties.length && properties.length > 0 && (
                <span className="ml-2 text-xs text-slate-400">({visibleMapProperties.length} ทรัพย์มีพิกัดแผนที่)</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="hidden sm:inline">เรียง:</span>
                <select
                  className="min-h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
                  value={values.sort ?? "newest"}
                  onChange={(event) => changeSort(event.target.value as NonNullable<SearchValues["sort"]>)}
                  aria-label="เรียงผลการค้นหา"
                >
                  {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="button" onClick={clearFilters} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
                <RotateCcw size={14} /> ล้างตัวกรอง
              </button>
              <div className="flex rounded-lg border border-slate-200 p-1 lg:hidden">
                <button type="button" onClick={() => setMobileMode("list")} className={`flex min-h-9 items-center gap-1 rounded-md px-3 text-xs font-bold ${mobileMode === "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}><List size={14} />รายการ</button>
                <button type="button" onClick={() => setMobileMode("map")} className={`flex min-h-9 items-center gap-1 rounded-md px-3 text-xs font-bold ${mobileMode === "map" ? "bg-slate-900 text-white" : "text-slate-600"}`}><MapIcon size={14} />แผนที่</button>
              </div>
            </div>
          </div>
          {activeFilters.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="ตัวกรองที่ใช้อยู่">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => removeFilter(filter.key)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:border-blue-200 hover:bg-blue-100"
                  aria-label={`ลบตัวกรอง ${filter.label}`}
                >
                  {filter.label}
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[48%_52%]">
        <section className={`${mobileMode === "map" ? "hidden" : "block"} p-3 sm:p-4 lg:block lg:max-h-[calc(100vh-12rem)] lg:min-h-[720px] lg:overflow-y-auto lg:p-6`} aria-label="รายการทรัพย์">
          {properties.length ? (
            <div className="space-y-4">
              {properties.map((property) => (
                <SearchPropertyCard
                  key={property.id}
                  property={property}
                  selected={selectedId === property.id}
                  onSelect={() => selectProperty(property.id)}
                  onHover={(hovered) => setHoveredId(hovered ? property.id : null)}
                  cardRef={(node) => node ? cardRefs.current.set(property.id, node) : cardRefs.current.delete(property.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center sm:min-h-[360px] lg:min-h-[520px]">
              <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">ไม่พบทรัพย์ในพื้นที่นี้</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">ลองล้างตัวกรองหรือค้นหาในพื้นที่กว้างขึ้น หากยังไม่มีทรัพย์ตรงเงื่อนไขสามารถฝากซื้อไว้ก่อนได้</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button type="button" onClick={clearFilters} className="btn-outline text-sm">ล้างตัวกรอง</button>
                  <Link href={buyerHref} className="btn-green text-sm">ฝากซื้อเงื่อนไขนี้</Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={`${mobileMode === "list" ? "hidden" : "block"} relative lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)]`} aria-label="แผนที่ค้นหาทรัพย์">
          <PropertyMap
            properties={properties}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={(id) => selectProperty(id, true)}
            onHover={setHoveredId}
            onBoundsChange={handleBoundsChange}
            fitKey={fitKey}
            boundary={boundary}
            className="h-[calc(100dvh-13rem)] min-h-[360px] sm:min-h-[440px] lg:h-full lg:min-h-0"
          />
          <label className="absolute right-3 top-3 z-[600] flex min-h-10 items-center gap-2 rounded-lg bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-md backdrop-blur">
            <input type="checkbox" checked={searchOnMove} onChange={(event) => setSearchOnMove(event.target.checked)} />
            ค้นหาเมื่อเลื่อนแผนที่
          </label>

          {mobileMode === "map" && selectedMapProperty && (
            <div className="absolute inset-x-3 bottom-3 z-[650] rounded-2xl border border-slate-200 bg-white/97 p-4 shadow-[0_14px_40px_rgba(2,24,55,0.28)] backdrop-blur lg:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${selectedMapProperty.status === "sold" ? "bg-slate-500" : "bg-emerald-600"}`}>
                      {listingStatusLabel(selectedMapProperty)}
                    </span>
                    {verificationBadges(selectedMapProperty).map((badge) => (
                      <span key={badge} className="text-[10px] font-bold text-emerald-700">✓ {badge}</span>
                    ))}
                    <span className={`text-[10px] font-bold ${selectedMapProperty.location_precision === "exact" ? "text-blue-700" : "text-amber-700"}`}>
                      {selectedMapProperty.location_precision === "exact" ? "พิกัดแบบ Exact" : "≈ ตำแหน่งโดยประมาณ"}
                    </span>
                  </div>
                  <h2 className="line-clamp-2 text-sm font-black leading-snug text-[#082f63]">{selectedMapProperty.title_th}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-slate-100"
                  aria-label="ปิดตัวอย่างทรัพย์"
                >
                  ×
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {selectedMapProperty.total_price != null && (
                  <span className="text-base font-black text-[#082f63]">{formatMoneyFull(selectedMapProperty.total_price)}</span>
                )}
                {propertySizeLabel(selectedMapProperty) && (
                  <span className="text-sm font-bold text-slate-600">{propertySizeLabel(selectedMapProperty)}</span>
                )}
                {selectedMapProperty.price_per_rai != null && (
                  <span className="text-xs text-slate-500">{formatMoneyFull(selectedMapProperty.price_per_rai)} / ไร่</span>
                )}
              </div>
              <Link href={`/property/${selectedMapProperty.slug}`} className="btn-green mt-3 w-full justify-center text-sm">
                ดูรายละเอียดทรัพย์
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
