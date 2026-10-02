import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { BUYER_ACTIONS, canApplyBuyerAction } from "./marketplace/buyer-demand-workflow.ts";
import type { BuyerRequirementStatus, PublicBuyerDemand } from "./types/database.ts";
import * as searchFilters from "./marketplace/search-filters.ts";
import * as searchSort from "./marketplace/search-sort.ts";
import { findBuyerMatches } from "./marketplace/matching.ts";
import { normalizeVerificationStatus } from "./marketplace/verification.ts";
import { SEED_PUBLIC_LISTINGS } from "./seed-listings.ts";
import * as presentation from "./marketplace/presentation.ts";

// Run the actual server modules with in-memory dependencies; never connect to a database.
function loadSource<T>(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  runInNewContext(compiled.outputText, {
    exports, require: (name: string) => {
      if (name === "@/lib/marketplace/presentation") return presentation;
      assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
      return modules[name];
    }, ...globals,
  });
  return exports as T;
}

test("sqm criteria persist in linked lead JSON and return as numeric admin and allowlisted public fields", async () => {
  let details: Record<string, unknown> = {};
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (sql: string, values: unknown[]) => {
      if (sql.includes("insert into leads")) {
        details = JSON.parse(String(values[3]));
        return [{ id: "saved" }];
      }
      assert.match(sql, /l\.details->>'min_usable_area_sqm'/);
      assert.match(sql, /l\.details->>'max_usable_area_sqm'/);
      return [{ ...details, min_usable_area_sqm: "80.25", max_usable_area_sqm: "120", min_size_rai: "1", max_size_rai: "2" }];
    } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": { searchProperties: async () => [] },
    "@/lib/marketplace/matching": { findBuyerMatches },
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  await marketplace.createBuyerRequirement({ name: "Buyer", phone: "0812345678", consent_pdpa: true, consent_public: true,
    transaction_type: "sale", property_type: "condo", province_ids: [], preferred_locations: [],
    min_size_rai: 1, max_size_rai: 2, min_usable_area_sqm: 80.25, max_usable_area_sqm: 120 });
  assert.equal(details.min_usable_area_sqm, 80.25);
  assert.equal(details.max_usable_area_sqm, 120);
  assert.equal(Object.hasOwn(details, "name"), false);
  for (const admin of [await marketplace.getBuyerRequirement("saved"), ...(await marketplace.getBuyerRequirements())]) {
    assert.equal(admin?.min_usable_area_sqm, 80.25);
    assert.equal(admin?.max_usable_area_sqm, 120);
    assert.equal(admin?.min_size_rai, 1);
  }
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn },
    "@/lib/neon/server": { getSqlIfConfigured: () => ({ query: async (sql: string) => {
      assert.match(sql, /r\.status = 'published' and r\.consent_pdpa and r\.consent_public/);
      assert.match(sql, /l\.consent_pdpa and l\.consent_at is not null/);
      assert.match(sql, /d\.reviewed_at is not null and d\.reviewed_by = 'reviewed'/);
      return [{ ...details, min_usable_area_sqm: "80.25", max_usable_area_sqm: "120", size_min_rai: "1", size_max_rai: "2", name: "PRIVATE", details: { phone: "PRIVATE" } }];
    } }) },
    "@/lib/seed-listings": {}, "@/lib/marketplace/search-sort": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/search-filters": {},
  });
  const demand = (await queries.getActiveDemands())[0];
  assert.equal(demand.min_usable_area_sqm, 80.25);
  assert.equal(demand.max_usable_area_sqm, 120);
  assert.equal(demand.size_min_rai, 1);
  assert.equal(Object.hasOwn(demand, "details"), false);
  assert.equal(Object.hasOwn(demand, "name"), false);
});

test("public normalization preserves all canonical types and never calls unknown types land", async () => {
  let row: Record<string, unknown> = {};
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn },
    "@/lib/neon/server": { getSqlIfConfigured: () => ({ query: async () => [row] }) },
    "@/lib/seed-listings": {}, "@/lib/marketplace/search-sort": {},
    "@/lib/marketplace/verification": { normalizeVerificationStatus }, "@/lib/marketplace/search-filters": {},
  });
  for (const property_type of presentation.PROPERTY_TYPES) {
    row = { property_type, land_type: "industrial" };
    assert.equal((await queries.getListingByRef(1))?.property_type, property_type);
    row = { land_type: property_type };
    assert.equal((await queries.getListingByRef(1))?.property_type, property_type);
    assert.equal((await queries.getActiveDemands())[0].land_type, property_type);
  }
  for (const value of [{ property_type: "new_type", land_type: "land" }, { land_type: "new_type" }]) {
    row = value;
    assert.equal((await queries.getListingByRef(1))?.property_type, "other");
  }
  for (const land_type of [undefined, "industrial", "eec", "logistics", "data_center", "investment"]) {
    row = { land_type };
    assert.equal((await queries.getListingByRef(1))?.property_type, "land");
  }
  const demandUi = loadSource<typeof import("../components/demand/BuyerDemandList.tsx")>("../components/demand/BuyerDemandList.tsx", {
    "react/jsx-runtime": {}, "next/link": {}, "lucide-react": {}, "@/lib/utils": {},
  });
  assert.equal(demandUi.demandSizeLabel({ size_min_rai: 1, size_max_rai: 2, min_usable_area_sqm: 80, max_usable_area_sqm: 120 }), "1–2 ไร่ · 80–120 ตร.ม. พื้นที่ใช้สอย");
  assert.equal(demandUi.demandSizeLabel({ size_min_rai: null, size_max_rai: null, max_usable_area_sqm: 80 }), "ไม่เกิน 80 ตร.ม. พื้นที่ใช้สอย");
});

test("buyer actions require approval before publication and keep terminal states private", () => {
  const allowed: Record<BuyerRequirementStatus, string[]> = {
    pending_review: ["approve", "closed", "reject"],
    approved: ["publish", "matched", "closed", "reject"],
    published: ["unpublish", "matched", "closed", "reject"],
    rejected: ["approve", "closed"],
    matched: ["closed"],
    closed: [],
    expired: ["closed"],
  };
  for (const status of Object.keys(allowed) as BuyerRequirementStatus[]) {
    assert.deepEqual(
      Object.keys(BUYER_ACTIONS).filter((action) => canApplyBuyerAction(status, action as keyof typeof BUYER_ACTIONS)),
      allowed[status],
    );
  }
  assert.equal(BUYER_ACTIONS.approve.to, "approved");
  assert.equal(BUYER_ACTIONS.unpublish.to, "approved");
});

test("anonymous submission returns only status and public inventory matches", async () => {
  const matches = { full: [], near: [], status: "available" };
  const route = loadSource<{ POST: (request: unknown) => Promise<{ status: number; body: unknown }> }>("../app/api/buyer-requirements/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    "@/lib/marketplace/schemas": { buyerRequirementSchema: { safeParse: () => ({ success: true, data: {} }) } },
    "@/lib/neon/marketplace": { createBuyerRequirement: async () => ({ id: "PRIVATE-SOURCE-ID", matches }) },
    "@/lib/neon/buyer-rate-limit": { allowBuyerSubmission: async () => true },
  });
  const result = await route.POST({ headers: { get: () => "test-ip" }, json: async () => ({}) });
  assert.equal(result.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)), { status: "pending_review", matches });
  const form = readFileSync(new URL("../components/forms/BuyerRequirementForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(form, /body\??\.id|requirementId|Ref /);
});

test("all admin API handlers return JSON 401 for no session and 403 for a forbidden session", async () => {
  let user: { id: string; email: string; emailVerified: boolean } | null = null;
  const modules = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status?: number }) => ({ body, status: options.status ?? 200 }) } },
    zod: { z }, "next/cache": { revalidatePath: () => {} },
    "@/lib/auth/admin": { getSessionUser: async () => user, isAdminUserAllowed: () => false },
    "@/lib/neon/marketplace": {}, "@/lib/marketplace/buyer-demand-workflow": {},
    "@/lib/marketplace/listing-workflow": {}, "@/app/admin/buyer-requirements/review-readiness": {},
  };
  for (const path of ["buyer-requirements/route.ts", "buyer-requirements/[id]/route.ts", "property-submissions/route.ts", "property-submissions/[id]/route.ts"]) {
    const route = loadSource<Record<string, (request: unknown, context: unknown) => Promise<{ status: number; body: { error: string } }>>>(`../app/api/admin/${path}`, modules);
    for (const handler of Object.values(route)) {
      user = null;
      const anonymous = await handler({ headers: {} }, { params: Promise.resolve({ id: "invalid" }) });
      assert.equal(anonymous.status, 401, path);
      assert.equal(anonymous.body.error, "Unauthorized");
      user = { id: "signed-in", email: "admin@example.com", emailVerified: false };
      const forbidden = await handler({ headers: {} }, { params: Promise.resolve({ id: "invalid" }) });
      assert.equal(forbidden.status, 403, path);
      assert.equal(forbidden.body.error, "Forbidden");
    }
  }
});

test("middleware preserves admin page login redirect while letting API handlers return JSON", () => {
  let redirects = 0;
  const middleware = loadSource<{ default: (request: unknown) => string }>("../../middleware.ts", {
    "next/server": { NextResponse: { next: () => "next" } },
    "@/lib/auth/server": { auth: { middleware: () => () => { redirects++; return "login"; } } },
  });
  const request = (pathname: string) => ({ nextUrl: { pathname, searchParams: new URLSearchParams() } });
  assert.equal(middleware.default(request("/api/admin/buyer-requirements")), "next");
  assert.equal(middleware.default(request("/api/admin/property-submissions/123")), "next");
  assert.equal(redirects, 0);
  assert.equal(middleware.default(request("/admin/buyer-requirements")), "login");
  assert.equal(redirects, 1);
});

const jsxRuntime = {
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  Fragment: "fragment",
};

test("public demand rendering and sitemap exclude withdrawn rows and private text", async () => {
  const component = loadSource<typeof import("../components/demand/BuyerDemandList.tsx")>("../components/demand/BuyerDemandList.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/link": "link", "lucide-react": {},
    "@/lib/utils": { LAND_TYPE_LABELS: { factory: "Factory" }, ZONING_LABELS: { purple: "Purple" },
      formatMoneyFull: (value: number) => String(value), formatUpdatedDate: () => "Published" },
  });
  const published = {
    slug: "public-demand", status: "published", is_public: true, published_at: "2026-10-01T00:00:00Z",
    land_type: "factory", province_names: ["Rayong"], size_min_rai: 0, size_max_rai: 10,
    max_price: 0, max_price_per_rai: 100, zoning: "purple", container_access: false, high_voltage: true,
    name: "PRIVATE", phone: "PRIVATE", line_id: "PRIVATE", intended_use: "PRIVATE",
    budget_note: "PRIVATE", seo_title: "PRIVATE", seo_description: "PRIVATE", special_requirements: "PRIVATE",
  };
  const rows = [published, ...["unpublished", "matched", "closed", "expired"].map((status) => ({ ...published, slug: status, status })),
    { ...published, slug: "no-consent", is_public: false }, { ...published, slug: "no-date", published_at: "" }];
  // Resolve nested components so the assertion covers the rendered criteria, not just props.
  function render(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(render);
    if (!node || typeof node !== "object") return node;
    const element = node as { type: unknown; props: Record<string, unknown> };
    if (typeof element.type === "function") return render(element.type(element.props));
    return { ...element, props: { ...element.props, children: render(element.props.children) } };
  }
  const view = JSON.stringify(render(component.default({ demands: rows as PublicBuyerDemand[] })));
  assert.doesNotMatch(view, /PRIVATE|no-consent|no-date|\/buyer-demand\/(?:unpublished|matched|closed|expired)/);
  assert.match(view, /\/buyer-demand\/public-demand/);
  assert.match(view, /ไม่จำเป็น/);
  assert.match(view, /ต้องการ/);
  const sitemap = loadSource<typeof import("../app/sitemap.ts")>("../app/sitemap.ts", {
    "@/lib/neon/queries": { getActiveDemands: async () => rows, getAllProvinces: async () => [], getPublishedPosts: async () => [] },
    "@/lib/public-inventory": { getPublicInventory: async () => [] }, "@/lib/utils": { LAND_TYPE_LABELS: {} },
    "@/components/demand/BuyerDemandList": component,
  }, { process: { env: {} } });
  const links = (await sitemap.default()).filter((entry) => entry.url.includes("/buyer-demand/"));
  assert.deepEqual(Array.from(links, (entry) => entry.url), ["https://landmarketthai.com/buyer-demand/public-demand"]);
});

test("unknown initial province recovers after a valid selection and submits without a source receipt", async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let posts = 0;
  const province = { id: "00000000-0000-4000-8000-000000000001", slug: "rayong", name_th: "Rayong" };
  const form = loadSource<{ default: (props: unknown) => { props: { children: Array<{ props: { onSubmit: (event: unknown) => Promise<void> } }> } } }>("../components/forms/BuyerRequirementForm.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/link": "link",
    react: { useRef: () => ({ current: false }), useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    } },
    "@/components/listings/ListingCard": "listing", "@/lib/marketplace/presentation": presentation,
    "@/lib/marketplace/schemas": { buyerRequirementSchema: { safeParse: () => ({ success: true, data: {} }) } },
  }, { fetch: async () => { posts++; return { ok: true, json: async () => ({ status: "pending_review", matches: { status: "available", full: [], near: [] } }) }; } });
  const render = () => { cursor = 0; return form.default({ provinces: [province], initial: { province: "unknown" } }); };
  const submit = (view: ReturnType<typeof render>) => view.props.children[0].props.onSubmit({ preventDefault: () => {} });
  await submit(render());
  assert.equal(posts, 0);
  states[0] = { ...(states[0] as object), province_ids: [province.id] };
  await submit(render());
  assert.equal(posts, 1);
  assert.equal((states[1] as { status: string }).status, "available");
  const success = render();
  assert.equal(success.props.children[0], false, "successful submission removes the form");
  assert.match(JSON.stringify(success), /ส่งคำขอใหม่/);
  const resultSection = success.props.children[1] as unknown as { props: { children: Array<{ props: { onClick: () => void } }> } };
  resultSection.props.children[1].props.onClick();
  assert.equal(states[1], null);
  assert.equal((states[0] as { name: string; consent_pdpa: boolean }).name, "");
  assert.equal((states[0] as { consent_pdpa: boolean }).consent_pdpa, false);
  assert.equal(posts, 1, "reset itself never resends");
});

test("public demand query outages reject while successful empty queries remain empty or not found", async () => {
  let configured = true;
  let fail = false;
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn }, "@/lib/neon/server": { getSqlIfConfigured: () => configured ? { query: async () => {
      if (fail) throw new Error("PRIVATE database failure");
      return [];
    } } : null },
    "@/lib/seed-listings": {}, "@/lib/marketplace/search-sort": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/search-filters": {},
  });
  assert.equal((await queries.getActiveDemands()).length, 0);
  assert.equal(await queries.getDemandBySlug("absent"), null);
  fail = true;
  await assert.rejects(queries.getActiveDemands(), /PRIVATE database failure/);
  await assert.rejects(queries.getDemandBySlug("absent"), /PRIVATE database failure/);
  configured = false;
  await assert.rejects(queries.getActiveDemands(), /database unavailable/);
  await assert.rejects(queries.getDemandBySlug("absent"), /database unavailable/);
});

test("public pages distinguish outages from empty lists and real 404 without exposing errors", async () => {
  let fail = true;
  let notFoundCalls = 0;
  const modules = {
    "react/jsx-runtime": jsxRuntime, "next/link": "link", "lucide-react": {},
    "next/navigation": { notFound: () => { notFoundCalls++; throw new Error("404"); } },
    "@/lib/neon/queries": {
      getActiveDemands: async () => { if (fail) throw new Error("PRIVATE"); return []; },
      getDemandBySlug: async () => { if (fail) throw new Error("PRIVATE"); return null; },
    },
    "@/components/demand/BuyerDemandList": { default: "list", isPublishedDemand: () => true },
    "@/components/ui/LineButton": "line", "@/components/seo/JsonLd": "schema", "@/lib/utils": {},
  };
  const list = loadSource<{ default: (props: unknown) => Promise<{ props: { role?: string } }> }>("../app/buyer-demand/page.tsx", modules);
  const detail = loadSource<{ default: (props: unknown) => Promise<unknown>; generateMetadata: (props: unknown) => Promise<unknown> }>("../app/buyer-demand/[slug]/page.tsx", modules);
  const props = { params: Promise.resolve({ slug: "absent" }), searchParams: Promise.resolve({ page: "1" }) };
  const errorView = await list.default(props);
  assert.equal(errorView.props.role, "alert");
  assert.doesNotMatch(JSON.stringify(errorView), /PRIVATE/);
  await assert.rejects(detail.default(props), /PRIVATE/);
  await assert.rejects(detail.generateMetadata(props), /PRIVATE/);
  assert.equal(notFoundCalls, 0);
  fail = false;
  assert.notEqual((await list.default(props)).props.role, "alert");
  await assert.rejects(detail.default(props), /404/);
  assert.equal(notFoundCalls, 1);
  const errorUi = readFileSync(new URL("../app/buyer-demand/error.tsx", import.meta.url), "utf8");
  assert.match(errorUi, /onClick=\{reset\}/);
  assert.doesNotMatch(errorUi, /error\.message|error\.stack/);
});

test("any property type is described honestly and homepage retains one bounded real-data map", () => {
  const detail = readFileSync(new URL("../app/buyer-demand/[slug]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(detail, /: "ที่ดิน"/);
  assert.equal((detail.match(/อสังหาริมทรัพย์ทุกประเภท/g) ?? []).length, 4);
  const list = readFileSync(new URL("../app/buyer-demand/page.tsx", import.meta.url), "utf8");
  assert.match(list, /อสังหาริมทรัพย์ทั่วประเทศไทย/);
  assert.doesNotMatch(list, /EEC/);
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((home.match(/<HomePropertyMap\b/g) ?? []).length, 1);
  assert.doesNotMatch(home, /PropertyMapPreview/);
  assert.match(home, /buyerDemands === null[\s\S]*role="alert"/);
  const map = readFileSync(new URL("../components/search/HomePropertyMap.tsx", import.meta.url), "utf8");
  assert.match(map, /max-h-/);
  assert.match(map, /overflow-y-auto/);
  const marketplace = readFileSync(new URL("./neon/marketplace.ts", import.meta.url), "utf8");
  assert.doesNotMatch(marketplace.split('from "@/lib/types/database"')[0], /\bLand,/);
});

function lifecycleMigrationSql() {
  const sql = readFileSync(new URL("../../db/migrations/20261001_buyer_demand_review.sql", import.meta.url), "utf8");
  // Decode only PL/pgSQL bodies so behavior assertions use their actual SQL literals.
  return sql.replace(/\b(as|do)\s+'((?:''|[^'])*)'/gi, (_, keyword, body: string) => `${keyword} ${body.replace(/''/g, "'")}`);
}

test("lifecycle SQL bodies survive a single-quote-aware semicolon splitter", () => {
  for (const [path, functions, blocks] of [
    ["../../db/migrations/20261001_buyer_demand_review.sql", 5, 1],
    ["../../db/tests/buyer_demand_lifecycle.sql", 0, 1],
  ] as const) {
    const sql = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(sql, /\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
    const statements: string[] = [];
    let statement = "";
    // Only standard strings shield semicolons; dollar quotes have no special handling.
    for (const token of sql.match(/'(?:''|[^'])*'|[^';]+|[';]/g) ?? []) {
      assert.notEqual(token, "'", "Unterminated standard SQL string");
      if (token === ";") {
        statements.push(statement.trim());
        statement = "";
      } else statement += token;
    }
    assert.equal(statement.trim(), "");
    const bodies = statements.filter((part) => /\bcreate or replace function\b|\bdo\s+'/i.test(part));
    assert.equal(bodies.filter((part) => /\bcreate or replace function\b/i.test(part)).length, functions);
    assert.equal(bodies.filter((part) => /\bdo\s+'/i.test(part)).length, blocks);
    for (const body of bodies) assert.match(body, /\b(?:as|do)\s+'(?:''|[^'])*\bend;\s*'$/i);
  }
});

test("lead revocation and detachment use source triggers and fresh consent evidence", () => {
  const sql = lifecycleMigrationSql();
  assert.doesNotMatch(sql, /^--.*;/m, "SQL tool statement splitters must not see comment semicolons");
  assert.match(sql, /order by id for update;\s+update buyer_requirements set consent_pdpa = false, consent_public = false/);
  assert.match(sql, /after update of consent_pdpa, consent_at on leads/);
  assert.match(sql, /new\.lead_id is distinct from old\.lead_id and new\.lead_id is not null/);
  assert.match(sql, /old\.lead_id is not null and new\.lead_id is null[\s\S]*new\.consent_pdpa := false;\s+new\.consent_public := false/);
  for (const consent of ["pdpa", "public"]) {
    assert.match(sql, new RegExp(`old\\.consent_${consent} and not new\\.consent_${consent} then new\\.consent_${consent}_at := null`));
    assert.match(sql, new RegExp(`new\\.consent_${consent}_at <= old\\.updated_at`));
  }
  assert.match(sql, /Review requires current consent evidence/);
});

test("publish readiness requires timestamped PDPA and public consent", () => {
  const readiness = loadSource<typeof import("../app/admin/buyer-requirements/review-readiness.ts")>("../app/admin/buyer-requirements/review-readiness.ts", {});
  const ready = { consent_pdpa: true, consent_pdpa_at: "2026-10-01T00:00:00Z", consent_public: true,
    consent_public_at: "2026-10-01T00:00:00Z", reviewed_at: "2026-10-01T00:00:00Z", reviewed_by: "admin" };
  assert.equal(readiness.buyerPublishReadinessIssues(ready).length, 0);
  for (const overrides of [{ consent_pdpa: false }, { consent_pdpa_at: null }, { consent_public: false },
    { consent_public_at: null }, { reviewed_at: null }, { reviewed_by: " " }]) {
    assert.ok(readiness.buyerPublishReadinessIssues({ ...ready, ...overrides }).length > 0);
  }
});

test("SQL publication has a unique sanitized projection, prior review and rerun guards", () => {
  const sql = lifecycleMigrationSql();
  const source = readFileSync(new URL("./neon/marketplace.ts", import.meta.url), "utf8");
  assert.match(source, /'pending_review'/);
  assert.match(source, /r\.updated_at = \$7::timestamptz/);
  assert.doesNotMatch(source, /xmin/);
  assert.match(source, /consent_pdpa and consent_public and consent_public_at is not null/);
  assert.match(sql, /new\.status = 'published' and old\.status = 'approved'/);
  assert.match(sql, /old\.reviewed_at is null[\s\S]*Publication requires prior review/);
  assert.match(sql, /New buyer requests must be pending_review/);
  assert.match(sql, /create unique index if not exists[^;]*\(buyer_requirement_id\)/);
  assert.match(sql, /on conflict \(buyer_requirement_id\) do update set is_public = true/);
  assert.match(sql, /new\.slug := 'buyer-demand-' \|\| new\.id::text/);
  assert.match(sql, /if not found or r\.status <> 'published' or not r\.consent_public or not r\.consent_pdpa/);
  assert.match(sql, /r\.consent_public_at is null/);
  const sanitizer = sql.slice(sql.indexOf("create or replace function sanitize_buyer_demand"), sql.indexOf("create trigger sanitize_buyer_demand"));
  for (const column of ["intended_use", "budget_note", "seo_title", "seo_description"]) {
    assert.ok(sanitizer.includes(`new.${column} := null;`));
  }
  assert.match(sanitizer, /new\.zoning := case when r\.zoning in/);
  assert.match(sanitizer, /new\.reviewed_by := 'reviewed'/);
  assert.doesNotMatch(sanitizer, /:= r\.(name|phone|line_id|lead_id|reviewed_by|review_note|purpose|preferred_locations|water_requirement|special_requirements)\b/);
  assert.match(sql, /update buyer_demand set is_public = false,[\s\S]*new\.status in \('matched','closed','expired'\)/);
  assert.doesNotMatch(sql, /add column (?!if not exists)/i);
  assert.doesNotMatch(sql, /create function /i);
  for (const [, table, constraint] of sql.matchAll(/alter table (\w+) add constraint (\w+)/g)) {
    assert.ok(sql.includes(`alter table ${table} drop constraint if exists ${constraint};`));
  }
  for (const [, trigger, table] of sql.matchAll(/create trigger (\w+) [^;]*? on (\w+)/g)) {
    assert.ok(sql.includes(`drop trigger if exists ${trigger} on ${table};`));
  }
  assert.match(sql, /where l\.id = r\.lead_id and r\.submitted_at is null/);
  assert.match(sql, /where not d\.is_public or not exists \([\s\S]*r\.id = d\.buyer_requirement_id/);
  for (const name of ["buyer_demand_status_check", "buyer_demand_publication_check", "buyer_demand_land_type_check"]) {
    assert.match(sql, new RegExp(`add constraint ${name}[\\s\\S]*?not valid;`));
    assert.ok(sql.indexOf("update buyer_requirements set status = status where status = 'published';") < sql.indexOf(`validate constraint ${name}`));
  }
  assert.match(sql, /greatest\(clock_timestamp\(\), old\.updated_at \+ interval '1 microsecond'\)/);
});

test("admin mutation binds the displayed timestamp and rejects a stale retry", async () => {
  let version = "2026-10-01T00:00:00.123456Z";
  const displayedVersion = version;
  let status = "approved";
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (query: string, params: unknown[]) => {
      assert.match(query, /r\.updated_at = \$7::timestamptz/);
      if (params[6] !== version || !(params[5] as string[]).includes(status)) return [];
      status = String(params[1]);
      version = "2026-10-01T00:00:00.123457Z";
      return [{ id: params[0] }];
    } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": {}, "@/lib/marketplace/matching": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  assert.equal(await marketplace.applyBuyerAdminAction("id", "publish", "admin", displayedVersion), true);
  // Closed is allowed from both approved and published; checking status alone would incorrectly pass.
  assert.equal(await marketplace.applyBuyerAdminAction("id", "closed", "admin", displayedVersion), false);
  assert.equal(status, "published");
  assert.equal(await marketplace.applyBuyerAdminAction("id", "closed", "admin", version), true);
});

test("admin approval of a withdrawn request returns a conflict without reaching the lifecycle exception", async () => {
  let consent = false;
  let consentAt: string | null = null;
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (query: string, params: unknown[]) => {
      assert.match(query, /\(\$3 <> 'approve' or \(consent_pdpa and consent_pdpa_at is not null\)\)/);
      if (params[2] === "approve" && (!consent || !consentAt)) return [];
      return [{ id: params[0] }];
    } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": {}, "@/lib/marketplace/matching": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  const version = "2026-10-01T00:00:00.123456Z";
  assert.equal(await marketplace.applyBuyerAdminAction("id", "approve", "admin", version), false);
  consent = true;
  assert.equal(await marketplace.applyBuyerAdminAction("id", "approve", "admin", version), false);
  consentAt = version;
  assert.equal(await marketplace.applyBuyerAdminAction("id", "approve", "admin", version), true);
  consent = false;
  assert.equal(await marketplace.applyBuyerAdminAction("id", "closed", "admin", version), true);
});

test("admin API requires a valid expected version, rejects stale actions with 409 and never caches PII", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const version = "2026-10-01T00:00:00.123456Z";
  let updated = false;
  let mutationWins = true;
  const route = loadSource<{ PATCH: (request: unknown, context: unknown) => Promise<{ status: number; headers: Record<string, string> }> }>("../app/api/admin/buyer-requirements/[id]/route.ts", {
    "next/server": { NextResponse: { json: (_body: unknown, options: { status?: number; headers: Record<string, string> }) => ({ status: options.status ?? 200, headers: options.headers }) } },
    zod: { z }, "next/cache": { revalidatePath: () => {} },
    "@/lib/auth/admin": { getSessionUser: async () => ({ id: "admin" }), isAdminUserAllowed: () => true },
    "@/lib/neon/marketplace": {
      getBuyerRequirement: async () => ({ id, status: "approved", updated_at: version }),
      applyBuyerAdminAction: async (_id: string, _action: string, _admin: string, expected: string) => { assert.equal(expected, version); updated = true; return mutationWins; },
    },
    "@/lib/marketplace/buyer-demand-workflow": { canApplyBuyerAction },
    "@/app/admin/buyer-requirements/review-readiness": { buyerPublishReadinessIssues: () => [] },
  });
  for (const [body, expectedStatus] of [
    [{ action: "closed" }, 400],
    [{ action: "closed", expected_updated_at: "invalid" }, 400],
    [{ action: "closed", expected_updated_at: "2026-10-01T00:00:00.123455Z" }, 409],
    [{ action: "closed", expected_updated_at: version, status: "published" }, 400],
  ] as const) {
    const response = await route.PATCH({ headers: {}, json: async () => body }, { params: Promise.resolve({ id }) });
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(updated, false);
  }
  mutationWins = false; // Another admin wins after GET but before UPDATE.
  assert.equal((await route.PATCH({ headers: {}, json: async () => ({ action: "closed", expected_updated_at: version }) }, { params: Promise.resolve({ id }) })).status, 409);
  const ui = readFileSync(new URL("../components/admin/AdminBuyerRequirements.tsx", import.meta.url), "utf8");
  assert.match(ui, /expected_updated_at: item\.updated_at/);
  const source = readFileSync(new URL("./neon/marketplace.ts", import.meta.url), "utf8");
  assert.equal((source.match(/to_char\(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'\)/g) ?? []).length, 2);
});

test("auth fallback is only available in local development", () => {
  const authModule = "./auth/server.ts";
  const modules = { "@neondatabase/auth/next/server": { createNeonAuth: (config: unknown) => config } };
  for (const env of [
    { NODE_ENV: "production" }, { NODE_ENV: "test" },
    { NODE_ENV: "development", VERCEL_ENV: "preview" },
    { NODE_ENV: "development", VERCEL: "1" },
    { NODE_ENV: "development", CI: "true" },
    { NODE_ENV: "development", AWS_LAMBDA_FUNCTION_NAME: "hosted" },
  ]) assert.throws(() => loadSource(authModule, modules, { process: { env } }), /NEON_AUTH_COOKIE_SECRET/);
  const local = loadSource<{ auth: { cookies: { secret: string } } }>(authModule, modules, { crypto: webcrypto, process: { env: { NODE_ENV: "development" } } });
  assert.ok(local.auth.cookies.secret.length >= 32);
  assert.notEqual(local.auth.cookies.secret, "landmarketthai-local-neon-auth-cookie-secret-2026");
  const secret = "a-private-build-secret-with-at-least-32-characters";
  const production = loadSource<{ auth: { cookies: { secret: string } } }>(authModule, modules, { process: { env: { NODE_ENV: "production", NEON_AUTH_COOKIE_SECRET: secret } } });
  assert.equal(production.auth.cookies.secret, secret);
});

test("public demand SELECT is an explicit allowlist and sitemap limits exceed 100", async () => {
  let receivedOffset: unknown;
  const source = readFileSync(new URL("./neon/queries.ts", import.meta.url), "utf8");
  const select = source.split("const PUBLIC_DEMAND_SELECT = `")[1].split("`;", 1)[0];
  const projected = select.replace(/\(select[\s\S]*?\) as (?:min|max)_usable_area_sqm/g, "sqm");
  assert.doesNotMatch(projected, /\*|buyer_requirement_id|reviewed_by|review_note|name\b|phone|line_id|preferred_locations|purpose|water_requirement|special_requirements/);
  for (const field of ["max_price", "max_price_per_rai", "zoning", "container_access", "high_voltage"]) assert.ok(select.includes(`d.${field}`));
  const where = source.split("const PUBLIC_DEMAND_WHERE = `")[1].split("`;", 1)[0];
  assert.match(where, /d\.status = 'published' and d\.is_public = true/);
  assert.match(where, /d\.reviewed_by = 'reviewed'/);
  const getDemands = source.split("export async function getActiveDemands")[1].split("export async function getDemandBySlug")[0];
  assert.match(getDemands, /Math\.trunc\(limit\), 1\), 5000/);
  assert.doesNotMatch(getDemands, /unstable_cache|, 100\)/);
  const forbidden = ["buyer_requirement_id", "reviewed_by", "name", "phone", "line_id", "review_note", "preferred_locations", "purpose", "water_requirement", "special_requirements"];
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn },
    "@/lib/neon/server": { getSqlIfConfigured: () => ({ query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /d\.status = 'published' and d\.is_public = true/);
      assert.match(sql, /limit \$1 offset \$2/);
      receivedOffset = params[1];
      return Array.from({ length: Number(params[0]) }, (_, i) => ({
        id: String(i), slug: `buyer-demand-${i}`, status: "published", is_public: true,
        published_at: "2026-10-01T00:00:00Z", size_min_rai: "0", max_price: "0", high_voltage: false,
        ...Object.fromEntries(forbidden.map((key) => [key, "PRIVATE"])),
      }));
    } }) },
    "@/lib/seed-listings": { SEED_PUBLIC_LISTINGS: [] },
    "@/lib/marketplace/search-sort": {}, "@/lib/marketplace/verification": {}, "@/lib/marketplace/search-filters": {},
  });
  const demands = await queries.getActiveDemands(200);
  assert.equal(demands.length, 200);
  assert.equal(demands[0].size_min_rai, 0);
  assert.equal(demands[0].max_price, 0);
  assert.equal(demands[0].high_voltage, false);
  for (const demand of demands) for (const field of forbidden) assert.equal(Object.hasOwn(demand, field), false, field);
  await queries.getActiveDemands(51, 250);
  assert.equal(receivedOffset, 250);
  await queries.getActiveDemands(51, -1);
  assert.equal(receivedOffset, 0);
});

test("buyer limiter uses the shared decision and bounds the outage fallback with hashed identifiers", async () => {
  let now = 0;
  let unavailable = false;
  let allowed = true;
  const limiter = loadSource<typeof import("./neon/buyer-rate-limit.ts")>("./neon/buyer-rate-limit.ts", {
    "node:crypto": { createHmac },
    "@/lib/neon/server": { getSql: () => ({ query: async (query: string, values: string[]) => {
      assert.match(query, /allow_buyer_submission/);
      assert.match(values[0], /^[0-9a-f]{64}$/);
      assert.ok(!values[0].includes("test-ip"));
      if (unavailable) throw new Error("offline");
      return [{ allowed }];
    } }) },
  }, { Date: { now: () => now }, process: { env: { NEON_AUTH_COOKIE_SECRET: "test-secret" } } });
  assert.equal(await limiter.allowBuyerSubmission("test-ip"), true);
  allowed = false;
  assert.equal(await limiter.allowBuyerSubmission("test-ip"), false);
  unavailable = true;
  for (let i = 0; i < 6; i++) assert.equal(await limiter.allowBuyerSubmission("test-ip"), true);
  assert.equal(await limiter.allowBuyerSubmission("test-ip"), false);
  now = 60_000;
  assert.equal(await limiter.allowBuyerSubmission("test-ip"), true);
  for (let i = 0; i < 9999; i++) assert.equal(await limiter.allowBuyerSubmission(String(i)), true);
  assert.equal(await limiter.allowBuyerSubmission("overflow"), false);
});

test("criteria invalidation and consent withdrawal precede lifecycle validation and projection sync", () => {
  const sql = lifecycleMigrationSql();
  const guard = sql.split("create or replace function guard_buyer_requirement_lifecycle()")[1].split("create trigger guard_buyer_requirement_lifecycle")[0];
  for (const field of ["property_type", "transaction_type", "province_ids", "preferred_locations", "min_size_rai", "max_size_rai", "max_price", "max_price_per_rai", "zoning", "container_access", "high_voltage", "purpose", "water_requirement", "special_requirements"]) {
    assert.ok(guard.includes(`new.${field}`) && guard.includes(`old.${field}`), field);
  }
  assert.match(guard, /is distinct from row\([\s\S]*new\.reviewed_at := null;[\s\S]*new\.reviewed_by := null;/);
  assert.match(guard, /old\.consent_pdpa and not new\.consent_pdpa[\s\S]*old\.consent_public and not new\.consent_public[\s\S]*new\.status := 'pending_review'/);
  assert.ok(guard.indexOf("new.reviewed_at := null;") < guard.indexOf("Invalid buyer request transition"));
  assert.match(guard, /new\.status = 'pending_review' and old\.status in \('approved','published'\)/);
  const sanitizer = sql.split("create or replace function sanitize_buyer_demand()")[1].split("create trigger sanitize_buyer_demand")[0];
  assert.match(sanitizer, /pg_trigger_depth\(\) < 2[\s\S]*source-trigger-managed/);
  assert.doesNotMatch(sanitizer, /for update|new\.slug :=[^;]*r\.id/);
  assert.match(sanitizer, /Buyer demand source cannot be changed/);
  assert.match(guard, /Buyer request source identity cannot be changed/);
  assert.match(sql, /submitted_at = created_at where submitted_at is null/);
  assert.doesNotMatch(sql, /add column if not exists submitted_at[^,]*default now/);
  for (const table of ["lands", "property_submissions", "buyer_requirements"]) {
    assert.match(sql, new RegExp(`add constraint ${table}_transaction_type_check\\s+check \\([^;]*transaction_type = 'sale'`));
  }
});

test("admin email allowlist requires verified server session email; forbidden users stay signed in", async () => {
  let user: import("./auth/admin.ts").AdminUser | null = { id: "user", email: "ADMIN@example.com", emailVerified: false };
  const admin = loadSource<typeof import("./auth/admin.ts")>("./auth/admin.ts", {
    "@/lib/auth/server": { auth: { getSession: async (options: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(options)), { query: { disableCookieCache: "true" } }); return { data: { user } }; } } },
  }, { process: { env: { ADMIN_EMAILS: "admin@example.com" } } });
  assert.equal(admin.isAdminUserAllowed(user, "admin@example.com"), false);
  assert.equal(await admin.getAdminUser(), null);
  assert.equal((await admin.getSessionUser())?.id, "user");
  user = { ...user, emailVerified: true };
  assert.equal((await admin.getAdminUser())?.id, "user");
  assert.equal(admin.isAdminUserAllowed({ ...user, emailVerified: undefined }, "admin@example.com"), false);
  assert.equal(admin.isAdminUserAllowed({ ...user, email: "other@example.com", role: "admin", emailVerified: false }, ""), true);
  user = null;
  assert.equal(await admin.getSessionUser(), null);
  const page = readFileSync(new URL("../app/admin/buyer-requirements/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!user\) redirect/);
  assert.match(page, /if \(!isAdminUserAllowed\(user\)\) return/);
});

test("public pages and admin queries continue beyond their initial page with bound parameters", async () => {
  const calls: unknown[][] = [];
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /limit 51 offset \$1/);
      assert.match(sql, /status = \$2/);
      assert.match(sql, /id::text = \$3/);
      calls.push([...params]); return [];
    } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": {}, "@/lib/marketplace/matching": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  await marketplace.getBuyerRequirements(250, "closed", "source-id");
  await marketplace.getBuyerRequirements(NaN);
  assert.deepEqual(calls, [[250, "closed", "source-id"], [0, "", ""]]);
  for (const path of ["../app/buyer-demand/page.tsx", "../app/admin/buyer-requirements/page.tsx"]) {
    const page = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(page, /Number\.isSafeInteger\(raw\)/);
    assert.match(page, /\(page - 1\) \* 50/);
    assert.match(page, /\.slice\(0, 50\)/);
    assert.match(page, /length > 50/);
    assert.match(page, /page \+ 1/);
  }
  const ui = readFileSync(new URL("../components/admin/AdminBuyerRequirements.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/buyer-requirements/[id]/route.ts", import.meta.url), "utf8");
  assert.match(ui, /href=\{`\/buyer-demand\/\$\{item\.public_slug\}`\}/);
  assert.doesNotMatch(ui + route, /buyer-demand-\$\{(?:id|item\.id)\}/);
});

test("persisted inventory rejects outages and strips reviewer identity while preserving verification", async () => {
  const seed = SEED_PUBLIC_LISTINGS[0];
  let unavailable = false;
  let configured = true;
  const sql = { query: async (query: string) => {
    if (unavailable) throw new Error("inventory offline");
    if (query.startsWith("select slug")) return [{ slug: seed.slug }];
    return [{ ...seed, verified_by: "private-reviewer", verification_status: "verified", review_note: "PRIVATE", province: seed.province }];
  } };
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn },
    "@/lib/neon/server": { getSqlIfConfigured: () => configured ? sql : null },
    "@/lib/seed-listings": { SEED_PUBLIC_LISTINGS },
    "@/lib/marketplace/search-sort": searchSort,
    "@/lib/marketplace/verification": { normalizeVerificationStatus },
    "@/lib/marketplace/search-filters": searchFilters,
  });
  const result = await queries.searchProperties({}, { persistedOnly: true });
  assert.equal(result.length, 1);
  assert.equal(result[0].verified_by, null);
  assert.equal(result[0].verification_status, "verified");
  assert.equal(Object.hasOwn(result[0], "review_note"), false);
  unavailable = true;
  await assert.rejects(queries.searchProperties({}, { persistedOnly: true }), /inventory offline/);
  configured = false;
  await assert.rejects(queries.searchProperties({}, { persistedOnly: true }), /database unavailable/);
});

test("buyer request is saved even when matching lookup is unavailable", async () => {
  let saved = false;
  const observed = { saved: false, filters: {} as searchFilters.PropertySearchFilters, persistedOnly: false };
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async () => { saved = true; return [{ id: "saved" }]; } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": { searchProperties: async (filters: searchFilters.PropertySearchFilters, options: { persistedOnly?: boolean }) => {
      observed.saved = saved;
      observed.filters = filters;
      observed.persistedOnly = options.persistedOnly === true;
      throw new Error("offline");
    } },
    "@/lib/marketplace/matching": { findBuyerMatches },
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  const result = await marketplace.createBuyerRequirement({ name: "Buyer", phone: "0812345678", consent_pdpa: true, consent_public: false,
    transaction_type: "sale", province_ids: ["province-id"], preferred_locations: [] });
  assert.equal(result.id, "saved");
  assert.equal(observed.saved, true);
  assert.deepEqual(observed.filters.province_ids, ["province-id"]);
  assert.deepEqual(observed.filters.location_terms, []);
  assert.equal(observed.filters.status, "active");
  assert.equal(observed.persistedOnly, true);
  assert.deepEqual(result.matches, { full: [], near: [], status: "unavailable" });
});

test("buy-request options only come from persisted UUID provinces and fail closed", async () => {
  let fail = false;
  const sql = async () => {
    if (fail) throw new Error("province outage");
    return [{ id: "00000000-0000-4000-8000-000000000001", slug: "rayong", name_th: "Rayong" }, { id: "seed-rayong", slug: "seed" }];
  };
  const queries = loadSource<typeof import("./neon/queries.ts")>("./neon/queries.ts", {
    "next/cache": { unstable_cache: (fn: unknown) => fn }, "@/lib/neon/server": { getSqlIfConfigured: () => sql },
    "@/lib/seed-listings": { SEED_PUBLIC_LISTINGS }, "@/lib/marketplace/search-sort": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/search-filters": {},
  });
  const provinces = await queries.getPersistedProvinces();
  assert.deepEqual(Array.from(provinces, (p) => p.id), ["00000000-0000-4000-8000-000000000001"]);
  fail = true;
  await assert.rejects(queries.getPersistedProvinces(), /province outage/);
  const page = readFileSync(new URL("../app/buy-request/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/forms/BuyerRequirementForm.tsx", import.meta.url), "utf8");
  assert.match(page, /getPersistedProvinces\(\)/);
  assert.doesNotMatch(page, /getAllProvinces/);
  assert.match(form, /if \(busy \|\| matches \|\| saving\.current \|\| !provinces\.length \|\| \(initial\.province && !initialProvince && !form\.province_ids\.length\)\) return/);
  assert.match(form, /disabled=\{busy \|\| !provinces\.length/);
  assert.match(form, /matches\.status !== "unavailable" && <>/);
});

test("unknown first or later province IDs return 400 before any buyer PII is saved", async () => {
  const known = "00000000-0000-4000-8000-000000000001";
  const unknown = "00000000-0000-4000-8000-000000000002";
  let writes = 0;
  const marketplace = loadSource<typeof import("./neon/marketplace.ts")>("./neon/marketplace.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (query: string) => {
      if (query.startsWith("select id from provinces")) return [{ id: known }];
      writes++; return [{ id: "saved" }];
    } }) },
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS },
    "@/lib/neon/queries": {}, "@/lib/marketplace/matching": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
  });
  const route = loadSource<{ POST: (request: unknown) => Promise<{ status: number; body: { field?: string } }> }>("../app/api/buyer-requirements/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    "@/lib/marketplace/schemas": { buyerRequirementSchema: { safeParse: (data: unknown) => ({ success: true, data }) } },
    "@/lib/neon/marketplace": marketplace,
    "@/lib/neon/buyer-rate-limit": { allowBuyerSubmission: async () => true },
  });
  for (const province_ids of [[unknown, known], [known, unknown]]) {
    const response = await route.POST({ headers: { get: () => "test" }, json: async () => ({
      name: "Buyer", phone: "0812345678", consent_pdpa: true, consent_public: false, province_ids,
      preferred_locations: [], transaction_type: "sale",
    }) });
    assert.equal(response.status, 400);
    assert.equal(response.body.field, "province_ids");
  }
  assert.equal(writes, 0);
});

test("sitemap demand pagination propagates later outages and caps the total at 50,000 URLs", async () => {
  let count = 401;
  let failAt = Infinity;
  const offsets: number[] = [];
  const sitemap = loadSource<typeof import("../app/sitemap.ts")>("../app/sitemap.ts", {
    "@/lib/neon/queries": {
      getActiveDemands: async (limit: number, offset: number) => {
        offsets.push(offset);
        if (offset >= failAt) throw new Error("demand outage");
        return Array.from({ length: Math.min(limit, Math.max(count - offset, 0)) }, (_, index) => ({
          slug: `buyer-demand-${offset + index}`, status: "published", is_public: true, published_at: "2026-10-01T00:00:00Z",
        }));
      }, getAllProvinces: async () => [], getPublishedPosts: async () => [],
    },
    "@/lib/public-inventory": { getPublicInventory: async () => [] },
    "@/lib/utils": { LAND_TYPE_LABELS: {} },
    "@/components/demand/BuyerDemandList": { isPublishedDemand: () => true },
  }, { process: { env: {} } });
  assert.equal((await sitemap.default()).filter((entry) => entry.url.includes("/buyer-demand/")).length, 401);
  assert.deepEqual(offsets, [0, 200, 400]);
  failAt = 200;
  await assert.rejects(sitemap.default(), /demand outage/);
  failAt = 0;
  await assert.rejects(sitemap.default(), /demand outage/);
  failAt = Infinity; count = 60_000;
  assert.equal((await sitemap.default()).length, 50_000);
});

test("linked lead evidence guards manual re-consent and selected provinces retain database FKs", () => {
  const sql = lifecycleMigrationSql();
  assert.match(sql, /from leads where id = new\.lead_id for share/);
  assert.match(sql, /lead_consent is distinct from true[\s\S]*Linked lead requires current PDPA consent/);
  assert.match(sql, /not new\.consent_pdpa or new\.consent_at is null/);
  assert.match(sql, /province_id uuid not null references provinces\(id\) on delete restrict/);
  assert.match(sql, /from unnest\(new\.province_ids\)/);
  const fixture = readFileSync(new URL("../../db/tests/buyer_demand_lifecycle.sql", import.meta.url), "utf8");
  assert.match(fixture, /Manual re-consent bypassed withdrawn lead/);
  assert.match(fixture, /Selected province lost FK protection/);
});

test("admin session lookup fails closed on an upstream error despite stale user data", async () => {
  const admin = loadSource<typeof import("./auth/admin.ts")>("./auth/admin.ts", {
    "@/lib/auth/server": { auth: { getSession: async (options: unknown) => {
      assert.deepEqual(JSON.parse(JSON.stringify(options)), { query: { disableCookieCache: "true" } });
      return { data: { user: { id: "revoked", role: "admin" } }, error: { message: "revoked" } };
    } } },
  }, { process: { env: {} } });
  assert.equal(await admin.getSessionUser(), null);
  assert.equal(await admin.getAdminUser(), null);
});

test("homepage map skips the tall map when no properties have coordinates and wraps the selected mobile card", () => {
  const component = loadSource<{ default: (props: { properties: unknown[] }) => unknown }>("../components/search/HomePropertyMap.tsx", {
    "react/jsx-runtime": jsxRuntime, react: { useState: () => [null, () => {}] },
    "next/link": "link", "lucide-react": {}, "@/lib/utils": {},
    "@/lib/marketplace/verification": {}, "@/lib/marketplace/presentation": presentation, "./PropertyMap": "map",
  });
  const view = JSON.stringify(component.default({ properties: [] }));
  assert.doesNotMatch(view, /"type":"map"|h-\[390px\]/);
  assert.match(view, /ยังไม่มีทรัพย์ที่มีพิกัดแผนที่/);
  const source = readFileSync(new URL("../components/search/HomePropertyMap.tsx", import.meta.url), "utf8");
  assert.match(source, /max-h-\[80%\] overflow-y-auto break-words \[overflow-wrap:anywhere\]/);
  assert.match(source, /min-w-0 flex-1[\s\S]*flex flex-wrap items-center/);
});

test("buyer validation names the invalid field, marks it and focuses it before sending", async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let focused = "";
  let posts = 0;
  const form = loadSource<{ default: (props: unknown) => { props: { children: Array<{ props: { onSubmit: (event: unknown) => Promise<void> } }> } } }>("../components/forms/BuyerRequirementForm.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/link": "link",
    react: { useRef: () => ({ current: false }), useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = value; }];
    } },
    "@/components/listings/ListingCard": "listing", "@/lib/marketplace/presentation": presentation,
    "@/lib/marketplace/schemas": { buyerRequirementSchema: { safeParse: () => ({ success: false, error: { issues: [{ path: ["phone"] }] } }) } },
  }, { fetch: async () => { posts++; } });
  const props = { provinces: [{ id: "province", slug: "rayong" }] };
  const view = form.default(props);
  await view.props.children[0].props.onSubmit({ preventDefault: () => {}, currentTarget: { querySelector: (selector: string) => ({ focus: () => { focused = selector; } }) } });
  assert.equal(focused, '[name="phone"]');
  assert.match(String(states[3]), /โทรศัพท์/);
  assert.equal(posts, 0);
  cursor = 0;
  assert.match(JSON.stringify(form.default(props)), /"aria-invalid":true/);
});
