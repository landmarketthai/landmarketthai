import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findProvince, getAdminOptions, loadThaiAdmin } from "./thai-admin.ts";

const inThailand = (lat: number | null, lng: number | null) => lat != null && lng != null && lat > 5 && lat < 21 && lng > 97 && lng < 106;

test("vendored Open Admin Data covers all 77 provinces, 928 districts and their subdistricts with geo", () => {
  const provinces = loadThaiAdmin();
  assert.equal(provinces.length, 77);
  assert.equal(new Set(provinces.map((p) => p.name_th)).size, 77);
  const districts = provinces.flatMap((p) => p.districts);
  assert.equal(districts.length, 928);
  const subdistricts = districts.flatMap((d) => d.subdistricts);
  assert.equal(subdistricts.length, 7364);
  for (const area of [...provinces, ...districts]) assert.ok(inThailand(area.lat, area.lng), `${area.name_th} has no usable center`);
  assert.ok(districts.every((d) => d.subdistricts.length > 0));
  assert.equal(findProvince("กรุงเทพมหานคร")?.districts.length, 50);
});

test("dependent options follow province -> district -> subdistrict and accept legacy names", () => {
  const rayong = getAdminOptions("ระยอง");
  assert.equal(rayong.province?.name_th, "ระยอง");
  assert.ok(rayong.districts.some((d) => d.name_th === "นิคมพัฒนา"));
  assert.deepEqual(rayong.subdistricts, []);
  const nikhom = getAdminOptions("จังหวัดระยอง", "อำเภอนิคมพัฒนา");
  assert.equal(nikhom.district?.name_th, "นิคมพัฒนา");
  assert.ok(nikhom.subdistricts.some((s) => s.name_th === "มะขามคู่"));
  assert.ok(nikhom.subdistricts.every((s) => s.lat === nikhom.district?.lat && s.lng === nikhom.district?.lng));
  assert.equal(getAdminOptions("ปราจีนบุรี", "กบินทร์บุรี").subdistricts.some((s) => s.name_th === "หนองกี่"), true);
  assert.equal(findProvince("อยุธยา")?.name_th, "พระนครศรีอยุธยา");
  assert.deepEqual(getAdminOptions("ไม่มีจังหวัดนี้"), { province: null, districts: [], district: null, subdistricts: [] });
  assert.equal(getAdminOptions("ระยอง", "ไม่มีอำเภอนี้").district, null);
});

test("province seed migration inserts exactly the 77 dataset provinces and keeps existing ids/slugs", () => {
  const sql = readFileSync(new URL("../../db/migrations/20261002_thai_provinces_seed.sql", import.meta.url), "utf8");
  const seeded = [...sql.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*'([a-z-]+)'/gm)];
  assert.deepEqual(seeded.map((m) => m[1]).sort(), loadThaiAdmin().map((p) => p.name_th).sort());
  assert.equal(new Set(seeded.map((m) => m[2])).size, 77);
  assert.match(sql, /on conflict \(slug\) do nothing/);
  assert.match(sql, /where not exists \(select 1 from thai_provinces_match/);
  const setClause = sql.match(/update provinces p set([\s\S]*?)\nfrom /)?.[1] ?? "";
  assert.deepEqual([...setClause.matchAll(/^\s*(\w+) =/gm)].map((m) => m[1]), ["lat", "lng", "name_en"]);
  assert.match(sql, /Open Admin Data/);
});

test("sell location UI only moves the map for dropdowns and clears stale pins", () => {
  const wizard = readFileSync(new URL("../components/forms/SellWizard.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../components/forms/LocationPicker.tsx", import.meta.url), "utf8");
  for (const fn of ["selectProvince", "selectDistrict", "selectSubdistrict"]) {
    assert.match(wizard, new RegExp(`function ${fn}\\([^)]*\\) \\{\\s*setForm\\(\\(v\\) => \\(\\{[^}]*lat: null, lng: null \\}\\)\\)`));
  }
  assert.match(wizard, /isBangkok \? "เขต" : "อำเภอ"/);
  assert.match(wizard, /isBangkok \? "แขวง" : "ตำบล"/);
  assert.match(wizard, /\/api\/thai-admin/);
  assert.doesNotMatch(wizard, /thailand-(flat|admin)\.json|lib\/thai-admin/);
  assert.match(picker, /markerRef\.current\?\.remove\(\)/);
  assert.match(picker, /flyTo\(\[focus\.lat, focus\.lng\]/);
  const page = readFileSync(new URL("../app/sell/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getPersistedProvinces\(\)/);
});
