import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, isPropertyType, propertySizeLabel } from "./marketplace/presentation.ts";
import { buyerRequirementSchema, draftSchema } from "./marketplace/schemas.ts";
import { parsePropertySearchParams, propertyMatchesSearchFilters } from "./marketplace/search-filters.ts";
import { hasPositiveArea, publishReadinessIssues } from "./marketplace/listing-workflow.ts";
import { submissionReadinessIssues } from "./marketplace/submission-readiness.ts";
import { LAND_CATEGORY_TYPES, LAND_TYPE_LABELS, slugToLandType } from "./utils.ts";
import { MAPS_LINK_ERRORS, coordinatesFromMapsUrl, isAllowedMapsUrl, parseMapsInput, resolveMapsInput } from "./google-maps-link.ts";
import { SEED_PUBLIC_LISTINGS } from "./seed-listings.ts";
import type { PropertySubmission } from "./types/database.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const CANONICAL = {
  land: "ที่ดิน",
  house: "บ้านเดี่ยว",
  house_with_land: "บ้านพร้อมที่ดิน",
  townhouse: "ทาวน์เฮาส์/ทาวน์โฮม",
  condo: "คอนโด",
  housing_project: "หมู่บ้าน/โครงการ",
  commercial_building: "อาคารพาณิชย์",
  office: "อาคารสำนักงาน",
  factory: "โรงงาน",
  warehouse: "โกดัง/คลังสินค้า",
  apartment: "อพาร์ตเมนต์/หอพัก",
  hotel_resort: "โรงแรม/รีสอร์ต",
  retail: "ร้านค้า/พื้นที่พาณิชย์",
  business_property: "กิจการพร้อมอสังหา",
  other: "อื่น ๆ",
};
const LEGACY = ["industrial", "eec", "logistics", "data_center", "investment"];

test("canonical property types are accepted consistently by labels, schemas, search and the migration", () => {
  assert.deepEqual(PROPERTY_TYPE_LABELS, CANONICAL);
  assert.deepEqual([...PROPERTY_TYPES], Object.keys(CANONICAL));
  const token = "00000000-0000-4000-8000-000000000000";
  for (const type of PROPERTY_TYPES) {
    assert.ok(isPropertyType(type), type);
    assert.equal(draftSchema.safeParse({ token, property_type: type }).success, true, `draft ${type}`);
    assert.equal(buyerRequirementSchema.safeParse({ property_type: type, name: "ผู้ซื้อ", phone: "0812345678", consent_pdpa: true }).success, true, `buyer ${type}`);
    assert.equal(parsePropertySearchParams(new URLSearchParams({ property_type: type })).property_type, type, `search ${type}`);
    assert.equal(LAND_TYPE_LABELS[type], CANONICAL[type], `land_type label ${type}`);
  }
  for (const legacy of LEGACY) {
    assert.equal(isPropertyType(legacy), false);
    assert.equal(draftSchema.safeParse({ token, property_type: legacy }).success, false, legacy);
    assert.ok(LAND_TYPE_LABELS[legacy as keyof typeof LAND_TYPE_LABELS], `legacy label ${legacy}`);
  }
  assert.equal(draftSchema.safeParse({ token, property_type: "rent" }).success, false);
  // SEO category pages stay on the original land categories.
  assert.deepEqual([...LAND_CATEGORY_TYPES].sort(), ["land", "factory", "warehouse", ...LEGACY].sort());
  assert.equal(slugToLandType("condo"), null);
  assert.equal(slugToLandType("data-center"), "data_center");

  const sql = read("../../db/migrations/20261002_property_types_usable_area.sql");
  const listed = (constraint: string) => {
    const body = sql.slice(sql.indexOf(`add constraint ${constraint}`));
    const values = body.slice(0, body.indexOf(";")).match(/'([a-z_]+)'/g) ?? [];
    return values.map((value) => value.slice(1, -1)).sort();
  };
  const expected = [...PROPERTY_TYPES].sort();
  for (const constraint of ["property_submissions_property_type_check", "lands_property_type_check", "buyer_requirements_property_type_check", "buyer_demand_land_type_check"]) {
    assert.deepEqual(listed(constraint), expected, constraint);
  }
  assert.deepEqual(listed("lands_land_type_check"), [...expected, ...LEGACY].sort());
  assert.match(sql, /add column if not exists usable_area_sqm numeric\(14,2\);[\s\S]*add column if not exists usable_area_sqm/);
  for (const [, table, constraint] of sql.matchAll(/alter table (\w+) add constraint (\w+)/g)) {
    assert.ok(sql.includes(`alter table ${table} drop constraint if exists ${constraint};`), `idempotent ${constraint}`);
    assert.match(sql, new RegExp(`add constraint ${constraint}[\\s\\S]*?not valid;\\s*alter table ${table} validate constraint ${constraint};`), `validated without blocking the add scan: ${constraint}`);
  }
  assert.match(sql, /add column if not exists usable_area_sqm/);
  assert.doesNotMatch(sql, /drop column|delete from|update\s+\w+\s+set/i);
});

test("search filters by every canonical type and keeps legacy land categories as land", () => {
  const seed = SEED_PUBLIC_LISTINGS.find((land) => land.status === "active");
  assert.ok(seed);
  const condo = { ...seed, property_type: "condo" as const, land_type: "condo" as const };
  assert.ok(propertyMatchesSearchFilters(condo, { property_type: "condo" }));
  assert.equal(propertyMatchesSearchFilters(condo, { property_type: "land" }), false);
  assert.ok(propertyMatchesSearchFilters(seed, { property_type: "land" }));
});

const baseDraft = {
  property_type: "condo",
  transaction_type: "sale",
  title: "คอนโดใกล้ BTS",
  province_id: "00000000-0000-4000-8000-000000000001",
  total_rai: null,
  usable_area_sqm: null,
  contact_name: "เจ้าของ",
  contact_phone: "0812345678",
  sale_price: 3_500_000,
  lat: null,
  lng: null,
  location_precision: "approx",
} as unknown as PropertySubmission;

test("readiness accepts land area or usable area, and requires at least one", () => {
  assert.ok(submissionReadinessIssues(baseDraft).includes("ขนาดพื้นที่"));
  assert.deepEqual(submissionReadinessIssues({ ...baseDraft, usable_area_sqm: 45.5 }), []);
  assert.deepEqual(submissionReadinessIssues({ ...baseDraft, total_rai: 1.25 }), []);
  assert.ok(submissionReadinessIssues({ ...baseDraft, usable_area_sqm: 0 }).includes("ขนาดพื้นที่"));
  const approved = { ...baseDraft, status: "approved" } as PropertySubmission;
  assert.ok(publishReadinessIssues(approved).includes("ขนาดพื้นที่"));
  assert.deepEqual(publishReadinessIssues({ ...approved, usable_area_sqm: 120 }), []);
  assert.equal(hasPositiveArea({ total_rai: 10 }), true, "existing land rows without usable area stay valid");
  assert.equal(propertySizeLabel({ size_rai: null, usable_area_sqm: 120 }), "120 ตร.ม.");
  assert.equal(propertySizeLabel({ size_rai: 2.5, usable_area_sqm: 120 }), "2.5 ไร่");
  assert.equal(propertySizeLabel({ size_rai: 0, usable_area_sqm: 120 }), "120 ตร.ม.");

  const marketplace = read("./neon/marketplace.ts");
  assert.match(marketplace, /and \(total_rai > 0 or usable_area_sqm > 0\)/, "submit SQL mirrors the area fallback");
  assert.match(marketplace, /usable_area_sqm = \$28/);
  assert.match(marketplace, /published_at, usable_area_sqm\r?\n/);
});

test("blank coordinates normalize to null and Maps pin coordinates outrank viewport centers", () => {
  const parsed = draftSchema.parse({ token: "00000000-0000-4000-8000-000000000000", lat: "", lng: "" });
  assert.equal(parsed.lat, null);
  assert.equal(parsed.lng, null);
  const maps = "https://www.google.com/maps/place/Foo/@13.1,100.1,15z/data=!3d13.2345678!4d100.8765432";
  assert.deepEqual(coordinatesFromMapsUrl(new URL(maps)), { lat: 13.2345678, lng: 100.8765432 });
  assert.deepEqual(coordinatesFromMapsUrl(new URL("https://www.google.com/maps/@13.1,100.1,15z")), { lat: 13.1, lng: 100.1 });
});

test("Google Maps input parses coordinates from raw pairs and Google URLs only", () => {
  const coords = (input: string) => {
    const parsed = parseMapsInput(input);
    if (parsed.kind === "coordinates") return parsed.value;
    if (parsed.kind === "url") return coordinatesFromMapsUrl(parsed.url);
    return "invalid";
  };
  assert.deepEqual(coords(" 13.0827, 101.0145 "), { lat: 13.0827, lng: 101.0145 });
  assert.equal(coords("https://www.google.com/maps/@12.9236,100.8825,17z"), null, "camera coordinates are not an exact pin");
  assert.deepEqual(coords("https://maps.google.com/?q=13.75,100.5"), { lat: 13.75, lng: 100.5 });
  assert.deepEqual(coords("https://www.google.com/maps/search/?api=1&query=13.7563,100.5018"), { lat: 13.7563, lng: 100.5018 });
  assert.deepEqual(coords("https://www.google.co.th/maps/place/13.7,100.6"), { lat: 13.7, lng: 100.6 });
  // The dropped pin (!3d!4d) wins over the viewport centre (@lat,lng) on place URLs.
  assert.deepEqual(
    coords("https://www.google.com/maps/place/Foo/@13.1,100.1,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.2345678!4d100.8765432"),
    { lat: 13.2345678, lng: 100.8765432 },
  );
  assert.deepEqual(coords("ดูตรงนี้ https://maps.google.com/?q=14.1,101.2 นะ"), { lat: 14.1, lng: 101.2 });
  assert.equal(coords("https://www.google.com/maps/place/Central+World"), null, "place names are never geocoded");

  for (const hostile of [
    "https://evil.example/maps/@13.1,100.1",
    "https://google.com.evil.example/maps/@13.1,100.1",
    "https://maps.google.com.attacker.io/?q=13.1,100.1",
    "https://maps.google.com@evil.example/?q=13.1,100.1",
    "https://goo.gl/abc123",
    "https://www.google.com/search?q=13.1,100.1",
    "ftp://maps.google.com/?q=13.1,100.1",
    "javascript:alert(1)",
    "http://169.254.169.254/latest/meta-data",
    "ที่ดินแถวบางนา",
  ]) {
    assert.equal(parseMapsInput(hostile).kind, "invalid", hostile);
  }
  for (const allowed of ["https://maps.app.goo.gl/AbC123", "https://goo.gl/maps/AbC123", "https://www.google.com/maps/place/x", "https://maps.google.co.th/?q=1,1"]) {
    assert.equal(isAllowedMapsUrl(new URL(allowed)), true, allowed);
  }
});

test("Google Maps resolver follows only allowlisted redirects and enforces Thailand bounds", async () => {
  const requested: string[] = [];
  const fakeFetch = (redirects: Record<string, string>) => (async (url: URL | string) => {
    requested.push(String(url));
    const location = redirects[String(url)];
    return { status: location ? 302 : 200, headers: new Headers(location ? { location } : {}) } as Response;
  }) as typeof fetch;

  const short = "https://maps.app.goo.gl/AbC123";
  assert.deepEqual(
    await resolveMapsInput(short, fakeFetch({ [short]: "https://www.google.com/maps/place/Site/@13.5,101.5,16z/data=!3d13.51!4d101.52" })),
    { ok: true, lat: 13.51, lng: 101.52 },
  );
  assert.deepEqual(requested, [short]);

  requested.length = 0;
  const hop = await resolveMapsInput(short, fakeFetch({ [short]: "http://169.254.169.254/latest/meta-data" }));
  assert.deepEqual(hop, { ok: false, error: MAPS_LINK_ERRORS.noCoordinates });
  assert.deepEqual(requested, [short], "a redirect to a non-Google host is never fetched");

  requested.length = 0;
  const placeOnly = await resolveMapsInput(short, fakeFetch({ [short]: "https://www.google.com/maps/place/Central+World" }));
  assert.deepEqual(placeOnly, { ok: false, error: MAPS_LINK_ERRORS.noCoordinates });

  const neverFetch = (async () => { throw new Error("must not fetch"); }) as typeof fetch;
  assert.deepEqual(await resolveMapsInput("https://evil.example/?q=13,100", neverFetch), { ok: false, error: MAPS_LINK_ERRORS.unsupported });
  assert.deepEqual(await resolveMapsInput("13.7563, 100.5018", neverFetch), { ok: true, lat: 13.7563, lng: 100.5018 });
  assert.deepEqual(await resolveMapsInput("100.5018, 13.7563", neverFetch), { ok: false, error: MAPS_LINK_ERRORS.outsideThailand }, "swapped lat/lng");
  assert.deepEqual(await resolveMapsInput("https://www.google.com/maps/@35.68,139.76,12z", neverFetch), { ok: false, error: MAPS_LINK_ERRORS.noCoordinates });
  assert.deepEqual(await resolveMapsInput("  ", neverFetch), { ok: false, error: MAPS_LINK_ERRORS.empty });
  assert.deepEqual(await resolveMapsInput(short, (async () => { throw new Error("offline"); }) as typeof fetch), { ok: false, error: MAPS_LINK_ERRORS.unreachable });

  const route = read("../app/api/maps-link/route.ts");
  assert.match(route, /resolveMapsInput\(input\)/);
  assert.doesNotMatch(route, /fetch\(/, "the route never fetches user URLs directly");
});

test("blank draft coordinates normalize to null while numeric zero and bounds remain explicit", () => {
  const token = "00000000-0000-4000-8000-000000000000";
  for (const value of ["", "   ", null]) {
    const result = draftSchema.parse({ token, lat: value, lng: value });
    assert.equal(result.lat, null);
    assert.equal(result.lng, null);
  }
  assert.equal(draftSchema.parse({ token, lat: "0", lng: 0 }).lat, 0);
  assert.equal(draftSchema.safeParse({ token, lat: 91 }).success, false);
  assert.equal(draftSchema.safeParse({ token, lng: -181 }).success, false);
});

test("sell form is one page: section headings, one submit, autosave, no stepper", () => {
  const wizard = read("../components/forms/SellWizard.tsx");
  for (const heading of ["ประเภททรัพย์", "ตำแหน่ง", "รายละเอียดและราคา", "รูปและเอกสาร", "ข้อมูลติดต่อ", "ตรวจสอบและส่ง"]) {
    assert.ok(wizard.includes(`"${heading}"`), heading);
  }
  assert.doesNotMatch(wizard, /setStep|ถัดไป|ย้อนกลับ|ChevronLeft|ChevronRight|ขั้นตอน \{/);
  assert.equal((wizard.match(/ส่งให้ทีมงานตรวจสอบ/g) ?? []).length, 1, "exactly one final submit button");
  assert.match(wizard, /บันทึกแบบร่าง/);
  assert.match(wizard, /setTimeout\(\(\) => void saveDraftRef\.current\(\), AUTOSAVE_DELAY_MS\)/);
  assert.match(wizard, /if \(loading \|\| submitting \|\| submitted \|\| !draftId \|\| !token\) return;/, "no autosave while loading or after submit");
  assert.match(wizard, /กำลังบันทึก/);
  assert.match(wizard, /บันทึกแล้ว/);
  assert.match(wizard, /PROPERTY_TYPES\.map/);
  assert.match(wizard, /grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5/, "compact responsive type grid");
  assert.match(wizard, /usable_area_sqm/);
  assert.match(wizard, /วางลิงก์ Google Maps หรือพิกัด/);
  assert.match(wizard, /\/api\/maps-link/);
  assert.match(wizard, /buyer_demand_slug: buyerDemandSlug/);
  assert.match(wizard, /consent_pdpa: true/);
  assert.doesNotMatch(wizard, /"rent"|เช่า/, "sale only");
});

test("Land Insights redirects to land and stays out of navigation and sitemap", () => {
  assert.doesNotMatch(read("../components/layout/Navbar.tsx"), /land-insights|ราคาตั้งขาย/);
  assert.doesNotMatch(read("../app/sitemap.ts"), /land-insights/);
  assert.doesNotMatch(read("../components/intelligence/index.ts"), /InventoryAnalytics/);
  assert.match(read("../../next.config.ts"), /source: "\/land-insights", destination: "\/land", permanent: true/);
  // Property detail intelligence stays.
  assert.match(read("../components/intelligence/index.ts"), /PropertyIntelligence/);
});
