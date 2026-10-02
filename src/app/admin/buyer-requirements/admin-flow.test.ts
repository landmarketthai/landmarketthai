import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { BUYER_ACTIONS, BUYER_STATUS_LABELS, canApplyBuyerAction } from "../../../lib/marketplace/buyer-demand-workflow.ts";
import * as readiness from "./review-readiness.ts";

function load<T>(path: string, modules: Record<string, unknown>, globals = {}): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  runInNewContext(compiled.outputText, { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
    return modules[name];
  }, ...globals });
  return exports as T;
}

const id = "00000000-0000-4000-8000-000000000001";
const version = "2026-10-01T00:00:00.123456Z";
const ready = { id, updated_at: version, status: "approved", consent_pdpa: true, consent_pdpa_at: version,
  consent_public: true, consent_public_at: version, reviewed_at: version, reviewed_by: "admin" };
type Reply = { status: number; body: { code?: string; error?: string }; headers: Record<string, string> };
type Handler = (request: unknown, context: unknown) => Promise<Reply>;

test("admin API protects private reads and validates every lifecycle action without a database", async () => {
  let user: { id: string } | null = null;
  let allowed = false;
  let item: typeof ready | null = { ...ready };
  let writes = 0;
  let wins = true;
  let fails = false;
  const modules = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status?: number; headers: Record<string, string> }) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    zod: { z }, "next/cache": { revalidatePath: () => {} },
    "@/lib/auth/admin": { getSessionUser: async () => user, isAdminUserAllowed: () => allowed },
    "@/lib/marketplace/buyer-demand-workflow": { canApplyBuyerAction },
    "@/app/admin/buyer-requirements/review-readiness": readiness,
    "@/lib/neon/marketplace": {
      getBuyerRequirements: async () => { if (fails) throw new Error("private SQL"); return item ? [item] : []; },
      getBuyerRequirement: async () => { if (fails) throw new Error("private SQL"); return item; },
      applyBuyerAdminAction: async (_id: string, _action: string, admin: string, expected: string, note?: string) => {
        assert.equal(admin, "admin"); assert.equal(expected, version);
        if (_action === "reject") assert.equal(note, "reason");
        writes++; return wins;
      },
    },
  };
  const detail = load<{ GET: Handler; PATCH: Handler }>("../../api/admin/buyer-requirements/[id]/route.ts", modules);
  const list = load<{ GET: Handler }>("../../api/admin/buyer-requirements/route.ts", modules);
  const request = (body = {}) => ({ nextUrl: { searchParams: new URLSearchParams() }, json: async () => body });
  const context = { params: Promise.resolve({ id }) };
  async function check(handler: Handler, body: object, status: number, ctx = context) {
    const response = await handler(request(body), ctx);
    assert.equal(response.status, status);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(response.headers.Vary, "Cookie");
    assert.equal(response.headers["X-Robots-Tag"], "noindex, nofollow");
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    return response;
  }
  for (const handler of [list.GET, detail.GET, detail.PATCH]) {
    await check(handler, {}, 401);
    user = { id: "admin" }; await check(handler, {}, 403); user = null;
  }
  user = { id: "admin" }; allowed = true;
  await check(list.GET, {}, 200); await check(detail.GET, {}, 200);
  await check(detail.GET, {}, 400, { params: Promise.resolve({ id: "invalid" }) });
  await check(detail.PATCH, { action: "publish" }, 400);
  await check(detail.PATCH, { action: "reject", expected_updated_at: version, note: "  " }, 400);
  await check(detail.PATCH, { action: "reject", expected_updated_at: version, note: "x".repeat(2001) }, 400);
  await check(detail.PATCH, { action: "closed", expected_updated_at: version, status: "closed" }, 400);
  const stale = await check(detail.PATCH, { action: "closed", expected_updated_at: "2026-10-01T00:00:00.123455Z" }, 409);
  assert.equal(stale.body.code, "stale_update"); assert.equal(writes, 0);
  item = { ...ready, status: "pending_review" };
  await check(detail.PATCH, { action: "publish", expected_updated_at: version }, 409);
  item = { ...ready, status: "pending_review", consent_pdpa: false };
  await check(detail.PATCH, { action: "approve", expected_updated_at: version }, 422);
  item = { ...ready, consent_public: false };
  await check(detail.PATCH, { action: "publish", expected_updated_at: version }, 422);
  assert.equal(writes, 0);
  for (const [action, status] of [["approve", "pending_review"], ["publish", "approved"], ["unpublish", "published"], ["matched", "published"], ["closed", "matched"], ["reject", "pending_review"]]) {
    item = { ...ready, status };
    await check(detail.PATCH, { action, expected_updated_at: version, note: " reason " }, 200);
  }
  assert.equal(writes, 6);
  wins = false; item = { ...ready };
  assert.equal((await check(detail.PATCH, { action: "closed", expected_updated_at: version }, 409)).body.code, "stale_update");
  item = null; await check(detail.GET, {}, 404); await check(detail.PATCH, { action: "closed", expected_updated_at: version }, 404);
  fails = true; await check(list.GET, {}, 500); await check(detail.GET, {}, 500); await check(detail.PATCH, { action: "closed", expected_updated_at: version }, 500);
});

type Element = { type: string; props: { children?: unknown; onClick?: () => Promise<void>; disabled?: boolean; onChange?: (event: unknown) => void } };
function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [node, ...elements(node.props.children)];
}

test("admin UI offers valid actions, blocks duplicate/stale clicks, preserves rejection notes and unlocks fresh rows", async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let requests = 0;
  let refreshes = 0;
  let expectedVersion = version;
  let reply: (value: unknown) => void = () => {};
  const runtime = { jsx: (type: string, props: Element["props"]) => ({ type, props }), jsxs: (type: string, props: Element["props"]) => ({ type, props }) };
  const view = load<{ default: (props: unknown) => unknown }>("../../../components/admin/AdminBuyerRequirements.tsx", {
    "react/jsx-runtime": runtime,
    react: {
      useState: (initial: unknown) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
      useRef: (initial: unknown) => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
      useTransition: () => [false, (fn: () => void) => fn()],
    },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) }, "next/link": "link",
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_ACTIONS, BUYER_STATUS_LABELS, canApplyBuyerAction },
    "@/app/admin/buyer-requirements/review-readiness": readiness,
    "@/lib/marketplace/presentation": { PROPERTY_TYPE_LABELS: {}, TRANSACTION_TYPE_LABELS: {} },
  }, { fetch: async (_url: string, options: { body: string; cache: string }) => {
    requests++; assert.equal(options.cache, "no-store");
    assert.equal(JSON.parse(options.body).expected_updated_at, expectedVersion);
    return new Promise((resolve) => { reply = resolve; });
  } });
  let item = { ...ready, name: "Private buyer", phone: "0812345678", province_ids: [], preferred_locations: [] };
  const render = () => { cursor = 0; return elements(view.default({ requirements: [item], provinces: [] })); };
  const button = (action: keyof typeof BUYER_ACTIONS) => render().find((node) => node.type === "button" && node.props.children === BUYER_ACTIONS[action].label)!;
  for (const status of Object.keys(BUYER_STATUS_LABELS)) {
    item = { ...item, status };
    const shown = render().filter((node) => node.type === "button").map((node) => node.props.children);
    for (const action of Object.keys(BUYER_ACTIONS) as Array<keyof typeof BUYER_ACTIONS>) {
      assert.equal(shown.includes(BUYER_ACTIONS[action].label), canApplyBuyerAction(status as keyof typeof BUYER_STATUS_LABELS, action));
    }
  }
  item = { ...item, status: "approved", consent_public: false };
  assert.equal(button("publish").props.disabled, true);
  item = { ...item, status: "pending_review", consent_pdpa: false };
  assert.equal(button("approve").props.disabled, true);
  item = { ...item, consent_pdpa: true };
  assert.equal(button("reject").props.disabled, true);
  render().find((node) => node.type === "textarea")!.props.onChange!({ target: { value: "reason" } });
  assert.equal(button("reject").props.disabled, false);
  const click = button("reject").props.onClick!;
  const pending = click(); await click(); assert.equal(requests, 1);
  reply({ ok: false, status: 409, json: async () => ({ error: "stale" }) }); await pending;
  assert.equal(refreshes, 1); assert.equal(button("reject").props.disabled, true);
  assert.equal((states[0] as Record<string, string>)[id], "reason");
  await button("reject").props.onClick!(); assert.equal(requests, 1);
  item = { ...item, updated_at: "2026-10-01T00:00:00.123457Z" };
  expectedVersion = item.updated_at;
  assert.equal(button("reject").props.disabled, false);
  const success = button("reject").props.onClick!();
  reply({ ok: true, status: 200, json: async () => ({ ok: true }) }); await success;
  assert.equal(requests, 2); assert.equal(refreshes, 2);
  assert.equal((states[0] as Record<string, string>)[id], "");
  assert.equal(button("approve").props.disabled, true);
  item = { ...item, status: "rejected", updated_at: "2026-10-01T00:00:00.123458Z" };
  assert.equal(button("approve").props.disabled, false);
});

test("both admin pages gate rendering with the existing server session and reject forbidden users", async () => {
  let user: { id: string } | null = null;
  let allowed = false;
  let reads = 0;
  const modules = {
    "react/jsx-runtime": { jsx: (type: string, props: Element["props"]) => ({ type, props }), jsxs: (type: string, props: Element["props"]) => ({ type, props }) },
    "next/link": "link", "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "@/lib/auth/admin": { getSessionUser: async () => user, isAdminUserAllowed: () => allowed },
    "@/components/admin/AdminSubmissions": "submissions", "@/components/admin/AdminBuyerRequirements": "buyers",
    "@/lib/marketplace/buyer-demand-workflow": { BUYER_STATUS_LABELS },
    "@/lib/neon/marketplace": { getBuyerRequirements: async () => { reads++; return []; } },
    "@/lib/neon/queries": { getAllProvinces: async () => { reads++; return []; } },
  };
  for (const [path, url] of [["./page.tsx", "/admin/buyer-requirements"], ["../properties/page.tsx", "/admin/properties"]]) {
    const page = load<{ default: (props: unknown) => Promise<unknown>; dynamic: string; metadata: { robots: { index: boolean } } }>(path, modules);
    assert.equal(page.dynamic, "force-dynamic"); assert.equal(page.metadata.robots.index, false);
    user = null; allowed = false;
    await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), { message: `/login?next=${url}` });
    user = { id: "user" };
    const forbidden = await page.default({ searchParams: Promise.resolve({}) });
    assert.match(JSON.stringify(forbidden), /ไม่มีสิทธิ์เข้าถึง/);
    assert.equal(reads, 0);
  }
});
