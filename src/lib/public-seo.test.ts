import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { Metadata } from "next";
import type { Land } from "./types/database.ts";
import { canonicalSiteUrl } from "./constants/site.ts";
import * as seo from "./public-seo.ts";
import { SEED_PUBLIC_LISTINGS, SEED_101_KABIN_LAND, SEED_109_RAI_LAND } from "./seed-listings.ts";
import { getPropertyDetail, propertyHref } from "./property-detail-data.ts";
import { KABIN_101 } from "./flagship-facts.ts";
import { formatMoney, listingHref } from "./utils.ts";
import { rankNearbyAnchors, LOCATION_ANCHORS } from "./location-intelligence.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
function load<T>(path: string, modules: Record<string, unknown>): T {
  const exports = {};
  const compiled = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  runInNewContext(compiled.outputText, { exports, process: { env: { DATABASE_URL: "mock-only" } }, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
    return modules[name];
  } });
  return exports as T;
}
const runtime = { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };

test("production host normalization uses www and preserves unrelated preview hosts", () => {
  for (const input of [undefined, "", "invalid", "ftp://example.test", "https://user:pass@example.test",
    "https://landmarketthai.com", "http://landmarketthai.com/path/", "https://www.landmarketthai.com/"]) {
    assert.equal(canonicalSiteUrl(input), "https://www.landmarketthai.com");
  }
  assert.equal(canonicalSiteUrl("https://preview.example.test/path/"), "https://preview.example.test");
});

test("listing metadata uses its own canonical, OG fields and cover image for seeds and future listings", () => {
  const dynamic: Land = { ...SEED_109_RAI_LAND, slug: "future-house", title_th: "บ้านตัวอย่าง", property_type: "house",
    seo_title: "บ้านตัวอย่าง | LandmarketThai", seo_description: "รายละเอียดบ้าน", description: null,
    images: [{ ...SEED_109_RAI_LAND.images![0], url_or_cdn_path: "/house.jpg", is_cover: true }] };
  for (const land of [...SEED_PUBLIC_LISTINGS, dynamic]) {
    const meta = seo.listingMetadata(land);
    assert.equal(meta.alternates?.canonical, `/property/${land.slug}`);
    const og = meta.openGraph as { url: string; title: string; description: string; images: string[] };
    assert.equal(og.url, `/property/${land.slug}`);
    assert.ok(og.title && og.description && og.images.length);
    assert.doesNotMatch(og.title, /\| LandmarketThai$/);
    assert.equal(listingHref(land.public_ref, land.slug), propertyHref(land.slug));
  }
  assert.equal(seo.listingMetadata(dynamic).description, "รายละเอียดบ้าน");
});

test("canonical route renders future inventory, rejects unknown slugs and redirects the duplicate route", async () => {
  const dynamic = { ...SEED_109_RAI_LAND, slug: "future-house", property_type: "house" };
  const dynamicComponent = () => null;
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": runtime, react: { cache: (fn: unknown) => fn },
    "next/navigation": { notFound: () => { throw new Error("404"); } }, "next/image": "image", "next/link": "link", "lucide-react": {},
    "@/components/properties/DynamicPropertyDetail": dynamicComponent, "@/lib/public-seo": seo,
    "@/lib/public-inventory": { getPublicInventory: async () => [dynamic, ...SEED_PUBLIC_LISTINGS] },
    "@/lib/seed-listings": { SEED_PUBLIC_LISTINGS }, "@/lib/similar-properties": { rankSimilarProperties: () => [] },
    "@/lib/neon/queries": { getListingBySlug: async (slug: string) => [dynamic, ...SEED_PUBLIC_LISTINGS].find(row => row.slug === slug) ?? null },
    "@/lib/property-detail-data": { getPropertyDetail, propertyDetails: [] }, "@/lib/marketplace/verification": {},
    "@/lib/utils": await import("./utils.ts"),
  };
  for (const name of ["forms/LeadForm", "properties/PropertyGallery", "properties/PropertyMobileActions", "properties/PropertyVideos", "ui/LineButton",
    "listings/ListingCard", "listings/VerificationSummary", "properties/ReferralCallout",
    "intelligence/PropertyIntelligence"]) modules[`@/components/${name}`] = {};
  const page = load<{ default: (props: unknown) => Promise<{ type: unknown; props: { property: Land } }>; generateMetadata: (props: unknown) => Promise<Metadata> }>("../app/property/[slug]/page.tsx", modules);
  const props = { params: Promise.resolve({ slug: dynamic.slug }) };
  const rendered = await page.default(props);
  assert.equal(rendered.type, dynamicComponent);
  assert.equal(rendered.props.property, dynamic);
  assert.equal((await page.generateMetadata(props)).alternates?.canonical, "/property/future-house");
  const missing = { params: Promise.resolve({ slug: "missing" }) };
  await assert.rejects(page.default(missing), /404/);
  const missingMetadata = await page.generateMetadata(missing);
  assert.equal(missingMetadata.alternates?.canonical, null);
  assert.equal(missingMetadata.openGraph, null);
  assert.equal((missingMetadata.robots as { index: boolean }).index, false);
  const redirect = load<{ default: (props: unknown) => Promise<void> }>("../app/properties/[slug]/page.tsx", {
    "@/lib/property-detail-data": { propertyHref }, "next/navigation": { permanentRedirect: (href: string) => { throw new Error(`308 ${href}`); } },
  });
  await assert.rejects(redirect.default(props), /308 \/property\/future-house/);
});

test("archive metadata noindexes empty scopes and leaves populated scopes indexable", async () => {
  const modules = {
    "react/jsx-runtime": runtime, "next/navigation": {}, "next/link": {}, "lucide-react": {},
    "@/components/listings/ListingGrid": {}, "@/components/search/LandArchive": {}, "@/components/seo/JsonLd": {},
    "@/lib/neon/queries": { getProvinceBySlug: async (slug: string) => ({ slug, name_th: slug, name_en: slug }) },
    "@/lib/fallback-provinces": {}, "@/lib/public-seo": seo,
    "@/lib/public-inventory": { getPublicInventory: async () => SEED_PUBLIC_LISTINGS },
    "@/lib/utils": await import("./utils.ts"),
  };
  for (const route of ["../app/land/[province]/page.tsx", "../app/land/[province]/[type]/page.tsx"]) {
    const page = load<{ generateMetadata: (props: unknown) => Promise<Metadata> }>(route, modules);
    for (const [province, type, index] of [["rayong", "industrial", true], ["rayong", "warehouse", false], ["empty-province", "industrial", false]] as const) {
      if (!route.includes("[type]") && province === "rayong" && type === "warehouse") continue;
      const meta = await page.generateMetadata({ params: Promise.resolve({ province, type }) });
      assert.equal((meta.robots as { index: boolean }).index, index);
      assert.equal((meta.robots as { follow: boolean }).follow, true);
      const path = route.includes("[type]") ? `/land/${province}/${type}` : `/land/${province}`;
      assert.equal(meta.alternates?.canonical, path);
      assert.equal((meta.openGraph as { url: string }).url, path);
      assert.equal(meta.title, route.includes("[type]") ? `${type === "warehouse" ? "โกดัง/คลังสินค้า" : "ที่ดินอุตสาหกรรม"}${province} – ที่ดิน ${province} ${type === "warehouse" ? "โกดัง/คลังสินค้า" : "ที่ดินอุตสาหกรรม"}` : `อสังหาริมทรัพย์ใน${province} – ${province}`);
    }
  }
});

test("sitemap omits empty scopes/content and uses only canonical listing URLs", async () => {
  let published = false;
  const sitemap = load<{ default: () => Promise<Array<{ url: string }>> }>("../app/sitemap.ts", {
    "@/lib/neon/queries": {
      getPublishedPosts: async () => published ? [{ slug: "post", updated_at: "2026-10-03" }] : [],
      getActiveDemands: async () => published ? [{ slug: "demand", published_at: "2026-10-03" }] : [],
    },
    "@/lib/public-inventory": { getPublicInventory: async () => SEED_PUBLIC_LISTINGS },
    "@/lib/public-seo": seo, "@/lib/constants/site": { SITE_URL: canonicalSiteUrl() },
    "@/components/demand/BuyerDemandList": { isPublishedDemand: () => true },
  });
  const empty = (await sitemap.default()).map(row => new URL(row.url).pathname);
  assert.ok(empty.includes("/land/rayong/industrial") && empty.includes("/land/rayong/eec"));
  assert.ok(!empty.includes("/land/rayong/warehouse") && !empty.includes("/land/prachin-buri/eec"));
  assert.ok(!empty.includes("/blog") && !empty.includes("/buyer-demand"));
  for (const land of SEED_PUBLIC_LISTINGS) assert.ok(empty.includes(propertyHref(land.slug)));
  assert.ok(!empty.some(path => path.startsWith("/properties/")));
  published = true;
  const populated = (await sitemap.default()).map(row => new URL(row.url).pathname);
  for (const path of ["/blog", "/blog/post", "/buyer-demand", "/buyer-demand/demand"]) assert.ok(populated.includes(path));
});

test("published-content availability drives navigation and archive indexing without client database reads", async () => {
  let published = false;
  const modules = { react: { cache: (fn: unknown) => fn }, "next/cache": { unstable_cache: (fn: unknown) => fn }, "@/lib/neon/queries": {
    getPublishedPosts: async () => published ? [{}] : [], getActiveDemands: async () => published ? [{}] : [],
  }, "@/components/demand/BuyerDemandList": { isPublishedDemand: () => true } };
  const availability = load<{ getPublicContentAvailability: () => Promise<{ blog: boolean; buyerDemand: boolean }> }>("./public-content.ts", modules);
  for (const state of [false, true]) {
    published = state;
    const flags = await availability.getPublicContentAvailability();
    assert.equal(flags.blog, state); assert.equal(flags.buyerDemand, state);
    for (const route of ["blog", "buyer-demand"]) {
      const archive = load<{ generateMetadata: () => Promise<Metadata> }>(`../app/${route}/page.tsx`, {
        ...modules, "react/jsx-runtime": runtime, "next/link": {}, "next/image": {}, "lucide-react": {},
        "@/lib/public-content": availability, "@/lib/public-seo": seo, "@/lib/utils": {},
        "@/components/demand/BuyerDemandList": {}, "@/components/ui/LineButton": {}, "@/components/seo/JsonLd": {},
      });
      assert.equal((await archive.generateMetadata()).robots && ((await archive.generateMetadata()).robots as { index: boolean }).index, state);
    }
  }
  assert.match(read("../components/layout/Navbar.tsx"), /link\.href !== "\/blog" \|\| showBlog/);
  assert.match(read("../components/layout/Footer.tsx"), /showBlog && <li>/);
  assert.match(read("../components/layout/Footer.tsx"), /showBuyerDemand && <li>/);
});

test("Kabin Buri area, price and mixed-document wording agree across seed and detail content", () => {
  const land = SEED_101_KABIN_LAND;
  const detail = getPropertyDetail(land.slug)!;
  assert.equal(land.size_rai, land.area_rai! + land.area_ngan! / 4 + land.area_sqwa! / 400);
  assert.equal(land.total_price, land.size_rai! * land.price_per_rai!);
  assert.equal(detail.size, KABIN_101.areaLabel);
  assert.ok(detail.facts.some(fact => fact.value === KABIN_101.totalPriceLabel));
  const content = JSON.stringify(detail);
  assert.doesNotMatch(content, /24 (?:ตร\.ว\.|ตารางวา)|13 ฉบับ|โอนกรรมสิทธิ์|เอกสารสิทธิ์ครบ/);
  assert.match(content, /ภ\.บ\.ท\.5 ไม่ใช่โฉนดที่ดิน/);
  assert.equal(land.area_sqwa, 22);
  assert.equal(land.size_rai, 101.055);
  assert.equal(land.total_price, 151_582_500);
  assert.equal(content.split(KABIN_101.documentNote).length - 1, 1);
  assert.ok(detail.gallery.some(image => image.src.endsWith("06-overview-flyer.png")));
});

test("price precision, unique gallery URLs and self reference filtering", () => {
  const card = read("../components/listings/ListingCard.tsx");
  assert.equal((card.match(/<ListingTrust\b/g) ?? []).length, 1);
  assert.doesNotMatch(card, /listingStatusLabel\(land\)|Sold out/);
  assert.equal(formatMoney(2_750_000), "2.75 ล้าน");
  assert.equal(formatMoney(2_300_000), "2.3 ล้าน");
  assert.equal(formatMoney(3_000_000), "3 ล้าน");
  assert.deepEqual(seo.uniqueGalleryImages([{ src: "/a", alt: "first" }, { src: "/a", alt: "duplicate" }, { src: "/b", alt: "second" }]).map(image => image.src), ["/a", "/b"]);
  const base = LOCATION_ANCHORS[0];
  const origin = { id: "self", slug: "self-slug", title_th: "self-name", lat: 0, lng: 0 };
  const anchors = [
    { ...base, id: "same-coordinates", coordinates: { lat: 0, lng: 0 } },
    { ...base, id: "self", coordinates: { lat: 1, lng: 1 } },
    { ...base, id: "listing-self-slug", coordinates: { lat: 1, lng: 1 } },
    { ...base, id: "same-name", label: "self-name", coordinates: { lat: 1, lng: 1 } },
    { ...base, id: "other", coordinates: { lat: 1, lng: 1 } },
    { ...base, id: "nearby-poi", coordinates: { lat: 0.00027, lng: 0 } },
  ];
  assert.deepEqual(rankNearbyAnchors(origin, anchors).map(row => row.anchor.id), ["nearby-poi", "other"]);
});

test("public source cannot reintroduce duplicate listing hrefs, prohibited claims or global keywords", () => {
  function walk(url: URL): URL[] {
    return readdirSync(url, { withFileTypes: true }).flatMap(entry => {
      const next = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      return entry.isDirectory() ? walk(next) : [next];
    });
  }
  for (const url of walk(new URL("../", import.meta.url))) {
    if (!/\.(ts|tsx)$/.test(url.pathname) || /\.test\.|\/admin\/|\/api\//.test(url.pathname)) continue;
    const source = readFileSync(url, "utf8");
    assert.doesNotMatch(source, /["'`]\/properties\//, url.pathname);
    assert.doesNotMatch(source, /ใหญ่ที่สุด|น่าเชื่อถือที่สุด|พาร์ทเนอร์กว่า 200\+? ราย|ทีม LandmarketThai ที่มีใบอนุญาต|EEC ทั่วไทย/, url.pathname);
  }
  for (const route of ["about", "contact"]) {
    const source = read(`../app/${route}/page.tsx`);
    assert.match(source, /ภัทรนาวินท์ กิจการนนท์/);
    assert.match(source, /086-055-5595|0860555595/);
  }
  assert.match(read("../app/about/page.tsx"), /9\/19 ซอยทุ่งเศรษฐี 7 แขวงดอกไม้ เขตประเวศ กรุงเทพมหานคร 10250/);
  assert.match(read("../app/contact/page.tsx"), /9\/19 ซอยทุ่งเศรษฐี 7 แขวงดอกไม้ เขตประเวศ กรุงเทพมหานคร 10250/);
  assert.doesNotMatch(read("../app/about/page.tsx"), /บริษัท .*จำกัด|เลขทะเบียนนิติบุคคล/);
  assert.doesNotMatch(read("../app/contact/page.tsx"), /บริษัท .*จำกัด|เลขทะเบียนนิติบุคคล/);
  assert.doesNotMatch(read("../app/layout.tsx"), /keywords:/);
  assert.doesNotMatch(read("../app/how-it-works/page.tsx"), /รับเงินทันที|สูงสุดหลายล้านบาทต่อดีล|โดยทั่วไป 1–3%/);
  assert.match(read("../components/properties/PropertyGallery.tsx"), /filter\(\(\{ index \}\) => index !== selectedIndex\)/);
  assert.doesNotMatch(read("../app/layout.tsx"), /canonical:|url: SITE_URL/, "root fallbacks must not give 404 pages homepage URLs");
  assert.match(read("../app/page.tsx"), /alternates: \{ canonical: SITE_URL \}/);
  assert.match(read("../app/page.tsx"), /openGraph: \{ url: SITE_URL \}/);
  for (const route of ["about", "contact", "sell", "become-partner", "how-it-works", "buy-request", "search", "blog", "buyer-demand"]) {
    assert.ok(read(`../app/${route}/page.tsx`).includes(`openGraph: { url: "/${route}" }`), route);
  }
});

test("legacy listing redirects resolved ref and rejects invalid or missing refs", async () => {
  let calls = 0;
  const page = load<{ default: (props: unknown) => Promise<void> }>("../app/listing/[slug]/page.tsx", {
    "@/lib/neon/queries": { getListingByRef: async (ref: number) => { calls++; return ref === 101 ? SEED_101_KABIN_LAND : null; } },
    "@/lib/property-detail-data": { propertyHref },
    "next/navigation": { notFound: () => { throw new Error("404"); }, permanentRedirect: (href: string) => { throw new Error(`308 ${href}`); } },
  });
  await assert.rejects(page.default({ params: Promise.resolve({ slug: "101-old-title" }) }), /308 \/property\/101-rai-kabin-buri/);
  for (const slug of ["oops", "101oops-title", "0-title", "9007199254740992-title", "101-"]) {
    await assert.rejects(page.default({ params: Promise.resolve({ slug }) }), /404/);
  }
  assert.equal(calls, 1);
  await assert.rejects(page.default({ params: Promise.resolve({ slug: "999-missing" }) }), /404/);
});

test("flagship canonical page and metadata survive inventory outage", async () => {
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": runtime, react: { cache: (fn: unknown) => fn },
    "next/navigation": { notFound: () => { throw new Error("404"); } }, "next/image": "image", "next/link": "link", "lucide-react": {},
    "@/components/properties/DynamicPropertyDetail": {}, "@/lib/public-seo": seo,
    "@/lib/public-inventory": { getPublicInventory: async () => { throw new Error("DB outage"); } },
    "@/lib/neon/queries": { getListingBySlug: async (slug: string) => SEED_PUBLIC_LISTINGS.find(row => row.slug === slug) ?? null },
    "@/lib/seed-listings": { SEED_PUBLIC_LISTINGS }, "@/lib/similar-properties": { rankSimilarProperties: () => [] },
    "@/lib/property-detail-data": { getPropertyDetail, propertyDetails: [] }, "@/lib/marketplace/verification": { landVerification: () => [] },
    "@/lib/utils": await import("./utils.ts"),
  };
  for (const name of ["forms/LeadForm", "properties/PropertyGallery", "properties/PropertyMobileActions", "properties/PropertyVideos", "ui/LineButton", "listings/ListingCard", "listings/VerificationSummary", "properties/ReferralCallout", "intelligence/PropertyIntelligence"]) modules[`@/components/${name}`] = {};
  const page = load<{ default: (props: unknown) => Promise<unknown>; generateMetadata: (props: unknown) => Promise<Metadata> }>("../app/property/[slug]/page.tsx", modules);
  for (const land of SEED_PUBLIC_LISTINGS) {
    const props = { params: Promise.resolve({ slug: land.slug }) };
    assert.ok(await page.default(props));
    assert.equal((await page.generateMetadata(props)).alternates?.canonical, propertyHref(land.slug));
  }
});

test("availability outages preserve indexing and independent content state with 300s cache", async () => {
  const availability = load<{ getPublicContentAvailability: () => Promise<{ blog: boolean | null; buyerDemand: boolean | null }> }>("./public-content.ts", {
    react: { cache: (fn: unknown) => fn }, "next/cache": { unstable_cache: (fn: unknown, keys: string[], options: { revalidate: number }) => { assert.equal(options.revalidate, 300); return fn; } },
    "@/lib/neon/queries": { getPublishedPosts: async () => { throw new Error("DB outage"); }, getActiveDemands: async () => [] },
    "@/components/demand/BuyerDemandList": { isPublishedDemand: () => true },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await availability.getPublicContentAvailability())), { blog: null, buyerDemand: false });
  for (const route of ["blog", "buyer-demand"]) {
    const page = load<{ generateMetadata: () => Promise<Metadata> }>(`../app/${route}/page.tsx`, {
      "react/jsx-runtime": runtime, "next/link": {}, "next/image": {}, "lucide-react": {},
      "@/lib/public-content": { getPublicContentAvailability: async () => ({ blog: null, buyerDemand: null }) },
      "@/lib/public-seo": seo, "@/lib/neon/queries": {}, "@/lib/utils": {},
      "@/components/demand/BuyerDemandList": {}, "@/components/ui/LineButton": {}, "@/components/seo/JsonLd": {},
    });
    assert.equal(((await page.generateMetadata()).robots as { index: boolean }).index, true);
  }
  assert.doesNotMatch(read("../app/layout.tsx"), /export const revalidate/);
  assert.match(read("../app/layout.tsx"), /showBlog=\{availability.blog !== false\}/);
  assert.match(read("../app/layout.tsx"), /showBuyerDemand=\{availability.buyerDemand !== false\}/);
});

test("corrective Kabin migration is a single targeted idempotent-safe update", () => {
  const sql = read("../../db/migrations/20261003_fix_kabin_101_area.sql").replace(/--[^\n]*/g, "");
  assert.equal((sql.match(/\bUPDATE\b/gi) ?? []).length, 1);
  assert.doesNotMatch(sql, /\bDELETE\b|\bINSERT\b|\bALTER\b|\bDROP\b|status|verification/i);
  assert.match(sql, /WHERE slug = '101-rai-kabin-buri';\s*$/);
  for (const assignment of ["size_rai = 101.055", "area_rai = 101", "area_ngan = 0", "area_sqwa = 22", "price_per_rai = 1500000", "total_price = 151582500"]) assert.ok(sql.includes(assignment));
  assert.match(read("../../db/migrations/20260929_marketplace_v2.sql"), /alter table lands alter column total_price drop expression/i);
  assert.match(read("../app/sitemap.ts"), /export const revalidate = 300/);
  assert.match(read("../app/sitemap.ts"), /shard when inventory approaches the limit/);
  assert.doesNotMatch(read("../app/sitemap.ts"), /force-dynamic|revalidate = 0/);
});


test("land overview and province archives retain their filters in the shared search screen", async () => {
  const SearchExperience = "SearchExperience";
  const page = load<{ default: (props: unknown) => Promise<{ props: { children: Array<{ type: unknown; props: { initialProperties: Land[]; initialValues: Record<string, unknown> } }> } }> }>("../components/search/LandArchive.tsx", {
    "react/jsx-runtime": runtime, "next/link": "Link", "lucide-react": {},
    "@/components/search/SearchExperience": SearchExperience,
    "@/lib/public-inventory": { getPublicInventory: async () => SEED_PUBLIC_LISTINGS },
    "@/lib/public-seo": seo, "@/lib/land-search": await import("./land-search.ts"),
    "@/lib/search-context": { loadSearchContext: async () => ({ provinces: [], provinceCodes: {}, locationOptions: [] }) },
    "@/lib/utils": await import("./utils.ts"),
  });
  const filters = { land_type: "industrial", province_slug: "rayong", price_min: 2300000, size_max: 40 };
  const overview = (await page.default({ filters })).props.children[0];
  assert.equal(overview.type, SearchExperience);
  assert.deepEqual(overview.props.initialProperties.map(row => row.slug), ["37-rai-eec-rayong"]);
  assert.equal(overview.props.initialValues.type, "industrial");
  assert.equal(overview.props.initialValues.min_price_per_rai, "2300000");
  assert.equal(overview.props.initialValues.max_size_rai, "40");
  assert.equal(overview.props.initialValues.province, "rayong");
  assert.equal(overview.props.initialValues.status, "active");
  const archive = (await page.default({ province: { name_th: "ระยอง" }, slug: "rayong", landType: "eec" })).props.children[0];
  assert.equal(archive.props.initialValues.type, "eec");
  assert.equal(archive.props.initialValues.province, "rayong");
  assert.equal(archive.props.initialValues.status, "active");
});

test("footer province links follow populated sitemap scopes, excluding sold-only and deleted inventory", async () => {
  let inventory: Land[] = [...SEED_PUBLIC_LISTINGS, ...SEED_PUBLIC_LISTINGS,
    { ...SEED_109_RAI_LAND, province: { ...SEED_109_RAI_LAND.province!, slug: "sold-only" } },
    { ...SEED_101_KABIN_LAND, deleted_at: "2026-10-05", province: { ...SEED_101_KABIN_LAND.province!, slug: "deleted-only" } }];
  const footer = load<{ default: (props: unknown) => Promise<unknown> }>("../components/layout/Footer.tsx", {
    "react/jsx-runtime": runtime, "next/link": "Link", "next/image": "Image",
    "@/components/ui/LineIcon": {}, "@/lib/constants/site": { LINE_OA: "https://example.test" },
    "@/lib/public-inventory": { getPublicInventory: async () => inventory }, "@/lib/public-seo": seo,
  });
  const links = async () => [...JSON.stringify(await footer.default({})).matchAll(/"href":"(\/land\/[^"?]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(await links(), ["/land/prachin-buri", "/land/rayong"]);
  inventory = [];
  assert.deepEqual(await links(), []);
});
