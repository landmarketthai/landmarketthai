"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { List, Map as MapIcon, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { Land, Province } from "@/lib/types/database";
import PropertyMap, { type MapBounds } from "./PropertyMap";
import SearchPropertyCard from "./SearchPropertyCard";

export interface SearchValues {
  q?: string;
  transaction_type?: "sale" | "rent";
  property_type?: "land" | "factory" | "warehouse";
  province?: string;
  district?: string;
  min_price?: string;
  max_price?: string;
  min_price_per_rai?: string;
  max_price_per_rai?: string;
  min_size_rai?: string;
  max_size_rai?: string;
  zoning?: string;
  eec?: boolean;
}

interface Props {
  initialProperties: Land[];
  provinces: Province[];
  initialValues: SearchValues;
  initialMode?: "list" | "map";
}

const propertyTypes = [
  ["", "ทั้งหมด"],
  ["land", "ที่ดิน"],
  ["factory", "โรงงาน"],
  ["warehouse", "โกดัง"],
] as const;

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

function paramsFromValues(values: SearchValues) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, value === true ? "1" : String(value));
  }
  return params;
}

export default function SearchExperience({ initialProperties, provinces, initialValues, initialMode = "list" }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<SearchValues>(initialValues);
  const [properties, setProperties] = useState(initialProperties);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"list" | "map">(initialMode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchOnMove, setSearchOnMove] = useState(true);
  const [loading, setLoading] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMapProperties = useMemo(
    () => properties.filter((property) => property.lat != null && property.lng != null),
    [properties],
  );

  const fetchResults = useCallback(async (nextValues: SearchValues, bounds?: MapBounds) => {
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
      const response = await fetch(`/api/properties/search?${params.toString()}`);
      if (!response.ok) return;
      const body = (await response.json()) as { properties?: Land[] };
      setProperties(body.properties ?? []);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function applyFilters() {
    const params = paramsFromValues(values);
    router.replace(params.size ? `/search?${params.toString()}` : "/search", { scroll: false });
    void fetchResults(values);
  }

  function clearFilters() {
    const cleared: SearchValues = {};
    setValues(cleared);
    router.replace("/search", { scroll: false });
    void fetchResults(cleared);
  }

  function selectProperty(id: string, fromMap = false) {
    setSelectedId(id);
    if (fromMap) {
      if (window.matchMedia("(max-width: 1023px)").matches) setMobileMode("list");
      setTimeout(() => {
        const card = cardRefs.current.get(id);
        if (!card) return;
        card.scrollIntoView({ block: "center" });
        const section = card.closest('section[aria-label="รายการทรัพย์"]');
        if (section) window.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - 72) });
      }, 0);
    }
  }

  function handleBoundsChange(bounds: MapBounds) {
    if (!searchOnMove) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchResults(values, bounds), 350);
  }

  const buyerHref = `/buy-request${paramsFromValues(values).size ? `?${paramsFromValues(values).toString()}` : ""}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="bg-[#071d4a] px-4 py-6 text-white sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="text-xs font-bold tracking-[0.16em] text-gold-400">PROPERTY SEARCH</div>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">ค้นหาที่ดิน โรงงาน และโกดัง</h1>
              <p className="mt-1 text-sm text-blue-100">ผลลัพธ์และตำแหน่งบนแผนที่มาจากข้อมูลจริงที่เผยแพร่ในระบบ</p>
            </div>
            <Link href="/buy-request" className="text-sm font-semibold text-white underline-offset-4 hover:underline">ยังไม่เจอทรัพย์? ฝากเงื่อนไข ›</Link>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[minmax(260px,1.4fr)_150px_160px_180px_auto]">
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
              value={values.transaction_type ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, transaction_type: (event.target.value || undefined) as SearchValues["transaction_type"] }))}
            >
              <option value="">ซื้อ / เช่า</option>
              <option value="sale">ซื้อ</option>
              <option value="rent">เช่า</option>
            </select>
            <select
              className="input"
              value={values.property_type ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, property_type: (event.target.value || undefined) as SearchValues["property_type"] }))}
            >
              {propertyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              className="input col-span-2 min-[420px]:col-span-1 lg:col-span-1"
              value={values.province ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, province: event.target.value || undefined }))}
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
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <input className="input" placeholder="อำเภอ" value={values.district ?? ""} onChange={(e) => setValues((v) => ({ ...v, district: e.target.value || undefined }))} />
              <input className="input" inputMode="decimal" placeholder="ราคาต่ำสุด" value={values.min_price ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_price: e.target.value || undefined }))} />
              <input className="input" inputMode="decimal" placeholder="ราคาสูงสุด" value={values.max_price ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_price: e.target.value || undefined }))} />
              <input className="input" inputMode="decimal" placeholder="บาท/ไร่ สูงสุด" value={values.max_price_per_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_price_per_rai: e.target.value || undefined }))} />
              <input className="input" inputMode="decimal" placeholder="ขนาดต่ำสุด (ไร่)" value={values.min_size_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, min_size_rai: e.target.value || undefined }))} />
              <input className="input" inputMode="decimal" placeholder="ขนาดสูงสุด (ไร่)" value={values.max_size_rai ?? ""} onChange={(e) => setValues((v) => ({ ...v, max_size_rai: e.target.value || undefined }))} />
              <select className="input" value={values.zoning ?? ""} onChange={(e) => setValues((v) => ({ ...v, zoning: e.target.value || undefined }))}>
                {zoningOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <input type="checkbox" checked={values.eec ?? false} onChange={(e) => setValues((v) => ({ ...v, eec: e.target.checked || undefined }))} />
                EEC เท่านั้น
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-[1600px] flex-col items-stretch gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 lg:px-8">
        <div className="text-sm text-slate-600">
          {loading ? "กำลังค้นหา..." : `พบ ${properties.length.toLocaleString("th-TH")} ทรัพย์`}
          {visibleMapProperties.length < properties.length && properties.length > 0 && (
            <span className="ml-2 text-xs text-slate-400">({visibleMapProperties.length} ทรัพย์มีพิกัดแผนที่)</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <button type="button" onClick={clearFilters} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
            <RotateCcw size={14} /> ล้างตัวกรอง
          </button>
          <div className="flex rounded-lg border border-slate-200 p-1 lg:hidden">
            <button type="button" onClick={() => setMobileMode("list")} className={`flex min-h-9 items-center gap-1 rounded-md px-3 text-xs font-bold ${mobileMode === "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}><List size={14} />รายการ</button>
            <button type="button" onClick={() => setMobileMode("map")} className={`flex min-h-9 items-center gap-1 rounded-md px-3 text-xs font-bold ${mobileMode === "map" ? "bg-slate-900 text-white" : "text-slate-600"}`}><MapIcon size={14} />แผนที่</button>
          </div>
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
            onSelect={(id) => selectProperty(id, true)}
            onBoundsChange={handleBoundsChange}
            className="h-[calc(100dvh-13rem)] min-h-[360px] sm:min-h-[440px] lg:h-full lg:min-h-0"
          />
          <label className="absolute right-3 top-3 z-[600] flex min-h-10 items-center gap-2 rounded-lg bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-md backdrop-blur">
            <input type="checkbox" checked={searchOnMove} onChange={(event) => setSearchOnMove(event.target.checked)} />
            ค้นหาเมื่อเลื่อนแผนที่
          </label>
        </section>
      </div>
    </div>
  );
}
