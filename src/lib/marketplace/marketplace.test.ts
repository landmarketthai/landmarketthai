import test from "node:test";
import assert from "node:assert/strict";
import { classifyBuyerMatch, findBuyerMatches } from "./matching.ts";
import { submissionReadinessIssues } from "./submission-readiness.ts";
import { SEED_PUBLIC_LISTINGS, resolveListingPresentation } from "../seed-listings.ts";
import { sortPropertyResults } from "./search-sort.ts";
import { buyerRequirementSchema, draftSchema } from "./schemas.ts";
import type { PropertySubmission } from "../types/database.ts";

const rayong = SEED_PUBLIC_LISTINGS.find((property) => property.slug === "37-rai-eec-rayong");
if (!rayong) throw new Error("37-rai Rayong seed listing is required for marketplace tests");

test("buyer matching keeps exact geography and separates full vs near", () => {
  const base = {
    property_type: "land" as const,
    transaction_type: "sale" as const,
    preferred_locations: ["ระยอง"],
    province_ids: [rayong.province_id],
    min_size_rai: 30,
    max_size_rai: 50,
    max_price: 100_000_000,
    max_price_per_rai: 3_000_000,
    zoning: null,
  };

  assert.equal(classifyBuyerMatch(rayong, base), "full");
  assert.equal(classifyBuyerMatch(rayong, { ...base, max_price: 1_000_000 }), "near");
  assert.equal(classifyBuyerMatch(rayong, { ...base, province_ids: ["00000000-0000-0000-0000-000000000000"] }), null);
});

test("buyer matching never returns sold inventory", () => {
  const sold = SEED_PUBLIC_LISTINGS.find((property) => property.status === "sold");
  assert.ok(sold);
  assert.equal(classifyBuyerMatch(sold, {
    transaction_type: sold.transaction_type,
    preferred_locations: [],
    province_ids: [],
  }), null);
});

test("search sorting keeps active inventory ahead of sold inventory", () => {
  const sorted = sortPropertyResults(SEED_PUBLIC_LISTINGS, "price_desc");
  const firstSoldIndex = sorted.findIndex((property) => property.status === "sold");
  assert.ok(firstSoldIndex > 0);
  assert.ok(sorted.slice(0, firstSoldIndex).every((property) => property.status === "active"));
});

test("seller readiness rejects zero price and zero area", () => {
  const draft = {
    property_type: "land",
    transaction_type: "sale",
    title: "ทรัพย์ทดสอบ",
    province_id: rayong.province_id,
    total_rai: 0,
    contact_name: "เจ้าของทรัพย์",
    contact_phone: "0812345678",
    sale_price: 0,
  } as PropertySubmission;

  const issues = submissionReadinessIssues(draft);
  assert.ok(issues.includes("ขนาดพื้นที่"));
  assert.ok(issues.includes("ราคาขาย"));
});

test("seller draft accepts blank province before the location step", () => {
  const draft = draftSchema.safeParse({
    token: "00000000-0000-4000-8000-000000000000",
    property_type: "land",
    transaction_type: "sale",
    province_id: "",
    title: "",
    district: "",
    subdistrict: "",
    address: "",
    lat: null,
    lng: null,
    area_rai: null,
    area_ngan: null,
    area_sqwa: null,
    frontage_m: null,
    depth_min_m: null,
    depth_max_m: null,
    road_name: "",
    road_width_m: null,
    zoning: null,
    sale_price: null,
    price_per_rai: null,
    description: "",
    contact_name: "",
    contact_phone: "",
    contact_line: "",
  });

  assert.equal(draft.success, true);
  if (draft.success) assert.equal(draft.data.province_id, null);
});

test("sale-only schemas reject rental transactions", () => {
  const draft = draftSchema.safeParse({
    token: "00000000-0000-4000-8000-000000000000",
    transaction_type: "rent",
  });
  const buyer = buyerRequirementSchema.safeParse({
    transaction_type: "rent",
    preferred_locations: [],
    province_ids: [],
    name: "ผู้ซื้อทดสอบ",
    phone: "0812345678",
    consent_pdpa: true,
  });

  assert.equal(draft.success, false);
  assert.equal(buyer.success, false);
});

test("seller readiness accepts a complete positive sale draft", () => {
  const draft = {
    property_type: "land",
    transaction_type: "sale",
    title: "ทรัพย์ทดสอบ",
    province_id: rayong.province_id,
    total_rai: 10,
    contact_name: "เจ้าของทรัพย์",
    contact_phone: "0812345678",
    sale_price: 20_000_000,
  } as PropertySubmission;

  assert.deepEqual(submissionReadinessIssues(draft), []);
});

// ── P0/P1: workflow, readiness, verification, search ────────────────────────
import { readFileSync } from "node:fs";
import { allowedAdminActions, canApplyAdminAction, coordinateIssues, publishReadinessIssues } from "./listing-workflow.ts";
import { normalizeVerificationStatus, verificationBadges, verificationDimensions } from "./verification.ts";
import {
  MAX_SEARCH_OFFSET,
  buildLocationOptions,
  collectOrderedMatches,
  locationChoices,
  parsePropertySearchParams,
  propertyMatchesSearchFilters,
  propertySearchSqlClauses,
  type PropertySearchFilters,
} from "./search-filters.ts";
import { propertySqlOrder } from "./search-sort.ts";

const approvedSubmission = {
  status: "approved",
  property_type: "land",
  transaction_type: "sale",
  title: "ที่ดินพร้อมขาย",
  province_id: rayong.province_id,
  total_rai: 12,
  sale_price: 30_000_000,
  lat: 12.86,
  lng: 101.09,
  location_precision: "exact",
} as PropertySubmission;

test("admin workflow only allows defined transitions", () => {
  assert.deepEqual(allowedAdminActions("pending_review"), ["approve", "reject"]);
  assert.deepEqual(allowedAdminActions("approved"), ["reject", "publish"]);
  assert.deepEqual(allowedAdminActions("published"), ["sold", "archive"]);
  assert.deepEqual(allowedAdminActions("sold"), ["archive", "relist"]);
  assert.deepEqual(allowedAdminActions("expired"), ["relist"]);
  assert.deepEqual(allowedAdminActions("rejected"), []);
  assert.deepEqual(allowedAdminActions("draft"), []);
  assert.equal(canApplyAdminAction("pending_review", "publish"), false);
  assert.equal(canApplyAdminAction("approved", "sold"), false);
});

test("publish readiness requires sale-only complete data and sane coordinates", () => {
  assert.deepEqual(publishReadinessIssues(approvedSubmission), []);
  assert.ok(publishReadinessIssues({ ...approvedSubmission, status: "pending_review" }).length > 0);
  assert.ok(publishReadinessIssues({ ...approvedSubmission, sale_price: null }).includes("ราคาขาย"));
  assert.ok(publishReadinessIssues({ ...approvedSubmission, total_rai: 0 }).includes("ขนาดพื้นที่"));
  assert.ok(publishReadinessIssues({ ...approvedSubmission, transaction_type: "rent" as never }).length > 0);
  // No coordinates is allowed (listing simply stays off the map) — never a fabricated fallback.
  assert.deepEqual(publishReadinessIssues({ ...approvedSubmission, lat: null, lng: null, location_precision: "approx" }), []);
});

test("coordinate rules reject partial, placeholder and out-of-country points", () => {
  assert.equal(coordinateIssues({ lat: 12.8, lng: null }).length, 1);
  assert.equal(coordinateIssues({ lat: 0, lng: 0 }).length, 1);
  assert.equal(coordinateIssues({ lat: 101.09, lng: 12.86 }).length, 1);
  assert.equal(coordinateIssues({ lat: null, lng: null, location_precision: "exact" }).length, 1);
  assert.deepEqual(coordinateIssues({ lat: 13.75, lng: 100.5 }), []);
});

test("verification dimensions only claim what the data supports", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const base = {
    verification_status: "verified" as const,
    lat: 12.86, lng: 101.09, location_precision: "exact" as const,
    zoning: "purple" as const, price: 1_000_000,
    updated_at: "2026-09-20T00:00:00Z", title_deed_on_file: true,
  };
  const dims = verificationDimensions(base, now);
  const byKey = Object.fromEntries(dims.map((d) => [d.key, d.state]));
  const labels = Object.fromEntries(dims.map((d) => [d.key, d.label]));
  // Generic listing review is the only verification field; it never upgrades other dimensions.
  assert.equal(byKey.review, "ok");
  assert.match(labels.review, /ทีมงานตรวจสอบประกาศ/);
  assert.equal(byKey.owner, "missing");
  assert.equal(byKey.document, "partial");
  assert.match(labels.document, /ยังไม่ได้บันทึกผลตรวจเอกสาร/);
  assert.equal(byKey.location, "partial");
  assert.match(labels.location, /พิกัดแบบ Exact/);
  assert.equal(byKey.zoning, "partial");
  assert.equal(byKey.price, "partial");
  assert.equal(byKey.recency, "ok");
  assert.match(labels.recency, /^ข้อมูลประกาศอัปเดต/);
  for (const dimension of dims) {
    assert.doesNotMatch(dimension.label, /ราคาอัปเดต|พิกัดยืนยัน|ผ่านการตรวจสอบ/);
    if (dimension.key !== "review" && dimension.key !== "recency") assert.notEqual(dimension.state, "ok", dimension.key);
  }

  const pending = Object.fromEntries(verificationDimensions({ ...base, verification_status: "pending", location_precision: "approx", updated_at: "2026-01-01T00:00:00Z", title_deed_on_file: false }, now).map((d) => [d.key, d.state]));
  assert.equal(pending.review, "missing");
  assert.equal(pending.location, "partial");
  assert.equal(pending.document, "missing");
  assert.equal(pending.recency, "partial");
  const noCoords = Object.fromEntries(verificationDimensions({ ...base, lat: null, lng: null }, now).map((d) => [d.key, d.state]));
  assert.equal(noCoords.location, "missing");

  const badges = verificationBadges({ ...rayong, title_deed_on_file: true, updated_at: "2026-09-25T00:00:00Z" }, now);
  assert.deepEqual(badges, ["ทีมงานตรวจสอบประกาศ", "ข้อมูลอัปเดตใน 30 วัน"]);
  assert.ok(!badges.some((badge) => /โฉนด|ราคา|ผังเมือง|พิกัด/.test(badge)));
});

test("only a literal stored 'verified' normalizes to verified", () => {
  assert.equal(normalizeVerificationStatus("verified"), "verified");
  assert.equal(normalizeVerificationStatus("rejected"), "rejected");
  for (const value of ["pending", null, undefined, "", "VERIFIED", "approved", 1]) {
    assert.equal(normalizeVerificationStatus(value), "pending");
  }
});

test("public UI never presents coordinate precision or stored files as verification", () => {
  for (const path of [
    "../../components/search/SearchPropertyCard.tsx",
    "../../components/search/SearchExperience.tsx",
    "../../components/search/HomePropertyMap.tsx",
    "../../components/search/PropertyMap.tsx",
    "../../components/admin/AdminSubmissionDetail.tsx",
    "../../app/properties/[slug]/page.tsx",
    "./verification.ts",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /พิกัดยืนยัน|ยืนยันพิกัด|พิกัดแปลงผ่านการตรวจสอบ|ตำแหน่งที่ยืนยัน|ราคาอัปเดต/, path);
  }
});

test("public SEO pages never claim title-deed verification the schema cannot prove", () => {
  for (const path of [
    "../../app/about/page.tsx",
    "../../app/land/page.tsx",
    "../../app/land/[province]/page.tsx",
    "../../app/land/[province]/[type]/page.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /ผ่านการตรวจสอบเอกสารสิทธิ์|ตรวจสอบเอกสารสิทธิ์แล้ว|ตรวจสอบแล้วทุกแปลง/, path);
  }
});

test("search params parse once for page and API, dropping unsupported values", () => {
  const filters = parsePropertySearchParams(new URLSearchParams(
    "property_type=rent&province=rayong&district=นิคมพัฒนา&subdistrict=มะขามคู่&min_depth_m=200&min_road_width_m=12&eec=1&zoning=purple&location_precision=exact&sort=bogus&limit=500",
  ));
  assert.equal(filters.property_type, undefined);
  assert.equal(filters.province_slug, "rayong");
  assert.equal(filters.subdistrict, "มะขามคู่");
  assert.equal(filters.min_depth_m, 200);
  assert.equal(filters.min_road_width_m, 12);
  assert.equal(filters.eec, true);
  assert.equal(filters.zoning, "purple");
  assert.equal(filters.location_precision, "exact");
  assert.equal(filters.sort, undefined);
  assert.equal(filters.limit, 100);
});

test("search filters match hierarchy, landmark text and industrial fields", () => {
  const sold = SEED_PUBLIC_LISTINGS.find((property) => property.status === "sold")!;
  assert.ok(propertyMatchesSearchFilters(rayong, { province_slug: "rayong", district: "อ.นิคมพัฒนา" }));
  assert.ok(propertyMatchesSearchFilters(sold, { district: "นิคมพัฒนา" }));
  assert.ok(!propertyMatchesSearchFilters(rayong, { subdistrict: "มะขามคู่" }));
  assert.ok(propertyMatchesSearchFilters(rayong, { q: "ถนนเข้าถึง" }));
  assert.ok(!propertyMatchesSearchFilters(rayong, { min_depth_m: 100 }));
  assert.ok(propertyMatchesSearchFilters({ ...rayong, depth_min_m: 216, depth_max_m: 241 }, { min_depth_m: 230 }));
  assert.ok(propertyMatchesSearchFilters(rayong, { min_frontage_m: 200, zoning: "purple", eec: true, location_precision: "exact" }));
  assert.ok(propertyMatchesSearchFilters(sold, { status: "sold" }));
  assert.ok(!propertyMatchesSearchFilters({ ...rayong, status: "archived" }, {}));
});

test("location options come only from listing data and dedupe admin prefixes", () => {
  const options = buildLocationOptions([
    { province_slug: "rayong", province_name: "ระยอง", district: "นิคมพัฒนา ระยอง", subdistrict: null },
    { province_slug: "rayong", province_name: "ระยอง", district: "อ.นิคมพัฒนา จ.ระยอง", subdistrict: null },
    { province_slug: "rayong", province_name: "ระยอง", district: null, subdistrict: "ต.มะขามคู่" },
    { province_slug: "prachin-buri", province_name: "ปราจีนบุรี", district: "กบินทร์บุรี ต.หนองกี่", subdistrict: null },
  ]);
  assert.deepEqual(options, [
    { province_slug: "prachin-buri", district: "กบินทร์บุรี", subdistrict: "หนองกี่" },
    { province_slug: "rayong", district: "นิคมพัฒนา", subdistrict: null },
  ]);
  const kabin = { ...rayong, district: "กบินทร์บุรี ต.หนองกี่", subdistrict: null };
  assert.ok(propertyMatchesSearchFilters(kabin, { district: "กบินทร์บุรี", subdistrict: "หนองกี่" }));
});

test("homepage and /buyer-demand render the same real buyer_demand source", () => {
  const home = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../app/buyer-demand/page.tsx", import.meta.url), "utf8");
  for (const source of [home, page]) {
    assert.match(source, /getActiveDemands\(/);
    assert.match(source, /\.filter\(isPublishedDemand\)/);
    assert.match(source, /<BuyerDemandList/);
    assert.doesNotMatch(source, /fallbackDemands|ที่แล้ว/);
  }
});

test("BuyerDemandList empty state is based on published public linkable demands", () => {
  const source = readFileSync(new URL("../../components/demand/BuyerDemandList.tsx", import.meta.url), "utf8");
  assert.match(source, /demand\.status === "published" && demand\.is_public && !!demand\.published_at && !!demand\.slug\?\.trim\(\)/);
  assert.match(source, /const visible = demands\.filter\(isPublishedDemand\);/);
  assert.match(source, /if \(!visible\.length\)/);
  assert.match(source, /visible\.map\(/);
});

test("homepage keeps one map, featured inventory and a compact demand fallback", () => {
  const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/<HomePropertyMap\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /PropertyMapPreview/);
  assert.match(source, /getFeaturedListings\(6\)/);
  assert.match(source, /sortedListings\.map\(/);
  assert.match(source, /buyerDemands\.length > 0 \? <section/);
  const fallback = source.split("</section> : <section")[1]?.split("</section>}")[0];
  assert.ok(fallback);
  assert.match(fallback, /href="\/buy-request"/);
  assert.doesNotMatch(fallback, /href="\/buyer-demand"|BuyerDemandList|py-12|py-14/);
});

test("public demand cards and detail metadata only render allowlisted typed criteria", () => {
  const list = readFileSync(new URL("../../components/demand/BuyerDemandList.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../../app/buyer-demand/[slug]/page.tsx", import.meta.url), "utf8");
  const allowed = new Set([
    "status", "is_public", "published_at", "slug", "province_names", "province", "land_type",
    "size_min_rai", "size_max_rai", "min_usable_area_sqm", "max_usable_area_sqm", "max_price", "max_price_per_rai", "zoning", "container_access", "high_voltage",
  ]);
  for (const source of [list, detail]) {
    for (const match of source.matchAll(/demand\.([a-z_]+)/g)) assert.ok(allowed.has(match[1]), match[1]);
    assert.doesNotMatch(source, /"active"|\.created_at|\.seo_title|\.seo_description/);
    assert.match(source, /<BuyerDemandCriteria demand=\{demand\}/);
  }
  for (const field of ["max_price", "max_price_per_rai", "zoning", "container_access", "high_voltage"]) {
    assert.ok(list.includes(`demand.${field}`), field);
  }
  assert.match(list, /demand\.province_names\.join/);
  assert.match(list, /range\(demand\.size_min_rai, demand\.size_max_rai, "ไร่"\)/);
  assert.match(list, /range\(demand\.min_usable_area_sqm, demand\.max_usable_area_sqm/);
  assert.doesNotMatch(detail, /generateStaticParams/);
  assert.equal((detail.match(/!demand \|\| !isPublishedDemand\(demand\)/g) ?? []).length, 2);
});

test("demand-bearing public pages render dynamically so withdrawals take effect", () => {
  for (const path of ["../../app/page.tsx", "../../app/buyer-demand/page.tsx", "../../app/buyer-demand/[slug]/page.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const revalidate = 0/);
    assert.doesNotMatch(source, /generateStaticParams|unstable_cache/);
  }
  const sitemap = readFileSync(new URL("../../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(sitemap, /lastModified: new Date\(d\.published_at\)/);
});

test("buyer matching finds full results after 100 rejected or near candidates", async () => {
  const source = readFileSync(new URL("../neon/marketplace.ts", import.meta.url), "utf8");
  assert.match(source, /findBuyerMatches\(input, \(limit, offset\) => searchProperties\([\s\S]*status: "active", limit, offset/);
  const input = { transaction_type: "sale" as const, preferred_locations: [], province_ids: [rayong.province_id], max_price: 100 };
  const candidates = Array.from({ length: 250 }, (_, index) => ({
    ...rayong, id: String(index), total_price: index >= 200 ? 100 : 200,
    province_id: index < 100 ? "elsewhere" : rayong.province_id,
  }));
  const offsets: number[] = [];
  const matches = await findBuyerMatches(input, async (limit, offset) => {
    offsets.push(offset);
    return candidates.slice(offset, offset + limit);
  });
  assert.deepEqual(offsets, [0, 100, 200]);
  assert.deepEqual(matches.full.map((row) => row.id), Array.from({ length: 12 }, (_, index) => String(200 + index)));
  assert.deepEqual(matches.near.map((row) => row.id), Array.from({ length: 12 }, (_, index) => String(100 + index)));
  assert.deepEqual(await findBuyerMatches(input, async () => { throw new Error("unavailable"); }), { full: [], near: [], status: "unavailable" });
  let pages = 0;
  const exhausted = await findBuyerMatches(input, async () => { pages++; return candidates.slice(0, 100); });
  assert.equal(pages, 10);
  assert.deepEqual(exhausted, { full: [], near: [], status: "limited" });
});

test("matching discards partial results after lookup failure and labels result truncation", async () => {
  const input = { transaction_type: "sale" as const, preferred_locations: [], province_ids: [] };
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...rayong, id: String(i) }));
  assert.deepEqual(await findBuyerMatches(input, async (_limit, offset) => {
    if (offset) throw new Error("second page failed");
    return rows;
  }), { full: [], near: [], status: "unavailable" });
  assert.equal((await findBuyerMatches(input, async () => rows.slice(0, 20))).status, "limited");
  assert.equal((await findBuyerMatches(input, async () => rows.slice(0, 2))).status, "available");
});

test("known listing presentation preserves DB images, zoning, price and status", () => {
  for (const seed of SEED_PUBLIC_LISTINGS) {
    const live = { ...seed, status: "active" as const, zoning: "green" as const, price_per_rai: 123,
      images: [{ id: "db-cover", land_id: seed.id, url_or_cdn_path: "/db.jpg", width: null, height: null, alt_th: "DB", is_cover: true, sort_order: 0, created_at: "", storage_key: "db" }] };
    const presentation = resolveListingPresentation(live);
    assert.equal(presentation.imageOverride, undefined);
    assert.equal(presentation.metaTagLabel, undefined);
    assert.equal(presentation.pricePerRaiLabel, undefined);
    assert.equal(presentation.soldOut, false);
    assert.equal(resolveListingPresentation({ ...live, status: "sold" }).soldOut, true);
    const fallback = resolveListingPresentation({ ...live, images: [], zoning: null, price_per_rai: null });
    assert.ok(fallback.imageOverride);
  }
});

test("buyer province filtering is parameterized and agrees with the in-memory recheck", () => {
  const ids = [rayong.province_id];
  const values: unknown[] = [];
  const sql = propertySearchSqlClauses({ province_ids: ids }, (value) => {
    values.push(value); return `$${values.length}`;
  }, []).join(" and ");
  assert.match(sql, /l\.province_id = any\(\$1::uuid\[\]\)/);
  assert.deepEqual(values, [ids]);
  assert.ok(propertyMatchesSearchFilters(rayong, { province_ids: ids }));
  assert.equal(propertyMatchesSearchFilters(rayong, { province_ids: ["other"] }), false);
  const terms = [rayong.province!.name_th, "nowhere"];
  const locationValues: unknown[] = [];
  const locationSql = propertySearchSqlClauses({ location_terms: terms }, (value) => {
    locationValues.push(value); return `$${locationValues.length}`;
  }, []).join(" and ");
  assert.match(locationSql, /strpos\([\s\S]* or strpos\(/);
  assert.deepEqual(locationValues, terms);
  assert.ok(propertyMatchesSearchFilters(rayong, { location_terms: terms }));
  assert.equal(propertyMatchesSearchFilters(rayong, { location_terms: ["nowhere"] }), false);
});

test("home list scrolls on mobile and the benefit strip only overlaps above the mobile hero breakpoint", () => {
  const map = readFileSync(new URL("../../components/search/HomePropertyMap.tsx", import.meta.url), "utf8");
  assert.match(map, /<ul className="[^"\n]*max-h-\[480px\][^"\n]*overflow-y-auto[^"\n]*overscroll-contain/);
  const home = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /bottom-0[^"\n]*md:hidden/);
  assert.doesNotMatch(home, /sm:-mt-/);
  assert.match(home, /mt-4[^"\n]*md:-mt-36/);
});

test("location choices are a strict hierarchy from listing data", () => {
  const options = [
    { province_slug: "rayong", district: "นิคมพัฒนา", subdistrict: "มะขามคู่" },
    { province_slug: "rayong", district: "ปลวกแดง", subdistrict: null },
    { province_slug: "prachin-buri", district: "กบินทร์บุรี", subdistrict: "หนองกี่" },
  ];
  assert.deepEqual(locationChoices(options, {}), { districts: [], subdistricts: [] });
  // No subdistricts until a district is chosen, and only that province's districts.
  assert.deepEqual(locationChoices(options, { province: "rayong" }), { districts: ["นิคมพัฒนา", "ปลวกแดง"], subdistricts: [] });
  assert.deepEqual(locationChoices(options, { province: "rayong", district: "นิคมพัฒนา" }).subdistricts, ["มะขามคู่"]);
  assert.deepEqual(locationChoices(options, { province: "rayong", district: "ปลวกแดง" }).subdistricts, []);
  assert.deepEqual(locationChoices(options, { district: "กบินทร์บุรี" }), { districts: [], subdistricts: [] });
});

test("search SQL pushes every filter down using schema-compatible expressions", () => {
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const filters: PropertySearchFilters = {
    q: "ถนน", property_type: "land", status: "active", province_slug: "rayong", district: "อ.นิคมพัฒนา",
    subdistrict: "มะขามคู่", min_price: 1, max_price: 2, min_price_per_rai: 1, max_price_per_rai: 2,
    min_size_rai: 1, max_size_rai: 2, min_frontage_m: 1, min_depth_m: 1, min_road_width_m: 1,
    zoning: "purple", eec: true, location_precision: "exact", west: 100, south: 12, east: 102, north: 14,
  };
  const sql = propertySearchSqlClauses(filters, add, ["seed-slug"]).join(" and ");
  assert.match(sql, /coalesce\(\(to_jsonb\(l\) ->> 'transaction_type'\), 'sale'\) = 'sale'/);
  // V2-only columns are only read through to_jsonb so the query works before the migration.
  for (const column of ["transaction_type", "property_type", "subdistrict", "address", "road_name", "road_width_m", "depth_min_m", "depth_max_m", "published_at", "verification_status"]) {
    assert.doesNotMatch(sql, new RegExp(`\\bl\\.${column}\\b`), column);
  }
  for (const fragment of ["strpos(lower(concat_ws", "l.district", "l.total_price >=", "l.total_price <=", "'depth_max_m'", "'road_width_m'", "l.zoning::text", "l.is_eec", "p.slug", "l.lng between", "any("]) {
    assert.ok(sql.includes(fragment), fragment);
  }
  // District filter is pre-normalized so "อ." prefixes can't make SQL stricter than the in-memory filter.
  assert.ok(params.includes("นิคมพัฒนา"));
  assert.ok(params.some((value) => Array.isArray(value) && value[0] === "seed-slug"));
  assert.doesNotMatch(propertySqlOrder("price_asc"), /\bl\.published_at\b/);
  assert.match(propertySqlOrder("price_asc"), /l\.total_price asc nulls last.*l\.public_ref asc/);
});

test("search paging keeps fetching past the first 100 rows until enough matches", async () => {
  // 250 ordered candidates; only every 50th passes the in-memory re-check.
  const rows = Array.from({ length: 250 }, (_, index) => index);
  const pages: Array<[number, number]> = [];
  const fetchPage = async (limit: number, offset: number) => {
    pages.push([limit, offset]);
    return rows.slice(offset, offset + limit);
  };
  assert.deepEqual(await collectOrderedMatches(fetchPage, (row) => row % 50 === 49, 4, 100), [49, 99, 149, 199]);
  assert.deepEqual(pages, [[100, 0], [100, 100]]);
  assert.deepEqual(await collectOrderedMatches(fetchPage, (row) => row === 240, 10, 100), [240]);
  assert.equal((await collectOrderedMatches(fetchPage, () => true, 5, 100)).length, 5);
  assert.ok(MAX_SEARCH_OFFSET >= 100);
});
