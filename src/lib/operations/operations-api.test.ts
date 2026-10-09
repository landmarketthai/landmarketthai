import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as rules from "./rules.ts";
import * as schemas from "./schemas.ts";

function load<T>(path: string, modules: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  runInNewContext(compiled.outputText, { exports, console, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
    return modules[name];
  } });
  return exports as T;
}

const id = "00000000-0000-4000-8000-000000000001";
const version = "2026-10-01T00:00:00.123456Z";
type Reply = { status: number; body: Record<string, unknown>; headers: Record<string, string> };
type Handler = (request: unknown, context: unknown) => Promise<Reply>;

function harness() {
  const state = {
    user: null as { id: string; email: string } | null,
    allowed: false,
    lead: { id, status: "new", assigned_to: null as string | null, next_action_at: null as string | null, updated_at: version } as Record<string, unknown> | null,
    deal: { id, stage: "negotiation", status: "in_progress", buyer_status: "qualified", updated_at: version } as Record<string, unknown> | null,
    createResult: { kind: "created", id, attributionId: null } as Record<string, unknown>,
    createError: null as unknown,
    updated: true,
    dbCalls: 0,
    events: [] as Record<string, unknown>[],
    leadUpdates: [] as unknown[][],
    dealUpdates: [] as unknown[][],
  };
  const db = <T>(fn: (...args: unknown[]) => T) => async (...args: unknown[]) => { state.dbCalls++; return fn(...args); };
  const modules = {
    "next/server": { NextResponse: { json: (body: Record<string, unknown>, options: { status?: number; headers: Record<string, string> }) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/auth/admin": { getSessionUser: async () => state.user, isAdminUserAllowed: () => state.allowed },
    "@/lib/neon/mutations": { insertEvent: async (event: Record<string, unknown>) => { state.events.push(event); } },
    "@/lib/operations/schemas": schemas,
    "@/lib/operations/rules": rules,
    "@/lib/operations/queries": {
      PAGE_SIZE: 50,
      listLeads: db(() => []), getLeadSummary: db(() => ({ total: 0, byStatus: {}, overdue: 0, unassigned: 0 })),
      getLead: db(() => state.lead), getDeal: db(() => state.deal), listDeals: db(() => []),
      updateLead: db((...args) => { state.leadUpdates.push(args); return state.updated; }),
      updateDeal: db((...args) => { state.dealUpdates.push(args); return { updated: state.updated, wonLeadId: args[3] === "won" ? "lead-1" : null }; }),
      createDeal: db(() => { if (state.createError) throw state.createError; return state.createResult; }),
    },
  };
  return { state, modules };
}

const request = (body: unknown = {}, search = "") => ({ nextUrl: { searchParams: new URLSearchParams(search) }, json: async () => body });
const context = { params: Promise.resolve({ id }) };

async function check(handler: Handler, body: unknown, status: number, ctx: unknown = context, search = "") {
  const response = await handler(request(body, search), ctx);
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.headers["X-Robots-Tag"], "noindex, nofollow");
  assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
  return response;
}

function routes(modules: Record<string, unknown>) {
  return {
    leads: load<{ GET: Handler }>("../../app/api/admin/leads/route.ts", modules),
    lead: load<{ GET: Handler; PATCH: Handler }>("../../app/api/admin/leads/[id]/route.ts", modules),
    deals: load<{ GET: Handler; POST: Handler }>("../../app/api/admin/deals/route.ts", modules),
    deal: load<{ GET: Handler; PATCH: Handler }>("../../app/api/admin/deals/[id]/route.ts", modules),
  };
}

test("every operations API requires a server session admin and ignores client admin flags", async () => {
  const { state, modules } = harness();
  const r = routes(modules);
  for (const handler of [r.leads.GET, r.lead.GET, r.lead.PATCH, r.deals.GET, r.deals.POST, r.deal.GET, r.deal.PATCH]) {
    state.user = null; await check(handler, { role: "admin", isAdmin: true }, 401);
    state.user = { id: "u", email: "u@example.com" }; await check(handler, { role: "admin", isAdmin: true }, 403);
  }
  assert.equal(state.dbCalls, 0);
  state.allowed = true;
  await check(r.leads.GET, {}, 200, context, "status=new&overdue=1&sort=next_action");
  await check(r.leads.GET, {}, 400, context, "status=bogus");
  await check(r.deals.GET, {}, 200, context, "status=closed&assigned_to=__none");
  await check(r.deals.GET, {}, 400, context, "status=won");
  await check(r.lead.GET, {}, 400, { params: Promise.resolve({ id: "nope" }) });
});

test("lead PATCH validates payloads, guards transitions, logs history and emits a contact-free event", async () => {
  const { state, modules } = harness();
  const { lead } = routes(modules);
  state.user = { id: "admin", email: "ops@example.com" }; state.allowed = true;
  for (const body of [
    {}, { status: "contacting" }, { expected_updated_at: version }, { expected_updated_at: version, status: "done" },
    { expected_updated_at: version, next_action_at: "2026-10-03 10:00" }, { expected_updated_at: version, note: "   " },
    { expected_updated_at: version, note: "x".repeat(2001) }, { expected_updated_at: version, status: "won", is_admin: true },
    { expected_updated_at: version, reopen: false, status: "contacting" },
  ]) await check(lead.PATCH, body, 400);
  assert.equal(state.leadUpdates.length, 0);
  assert.equal((await check(lead.PATCH, { expected_updated_at: "2026-10-01T00:00:00.123455Z", status: "contacting" }, 409)).body.code, "stale_update");
  await check(lead.PATCH, { expected_updated_at: version, status: "won" }, 422);
  await check(lead.PATCH, { expected_updated_at: version, status: "contacting", reopen: true }, 422);
  state.lead = { ...state.lead!, status: "won" };
  await check(lead.PATCH, { expected_updated_at: version, status: "contacting" }, 422);
  await check(lead.PATCH, { expected_updated_at: version, status: "qualified", reopen: true }, 422);
  assert.equal(state.leadUpdates.length, 0);
  await check(lead.PATCH, { expected_updated_at: version, status: "contacting", reopen: true }, 200);
  state.lead = { ...state.lead!, status: "new" };
  await check(lead.PATCH, { expected_updated_at: version, status: "contacting", assigned_to: " sales@x ", next_action_at: "2026-10-05T03:00:00.000Z", note: "Called, private detail 0812345678" }, 200);
  const [, input, log] = state.leadUpdates.at(-1) as [string, Record<string, unknown>, { type: string }[]];
  assert.equal(input.assigned_to, "sales@x");
  // vm-realm arrays: compare by value, not prototype.
  assert.equal(log.map((entry) => entry.type).join(","), "status,assign,next_action,note");
  const event = state.events.at(-1)!;
  assert.equal(event.eventType, "crm_lead_updated"); assert.equal(event.entityId, id);
  assert.doesNotMatch(JSON.stringify(event), /0812345678|private detail/);
  state.updated = false;
  assert.equal((await check(lead.PATCH, { expected_updated_at: version, note: "x" }, 409)).body.code, "stale_update");
});

test("deal create requires a buyer lead and property reference and maps duplicates to 409", async () => {
  const { state, modules } = harness();
  const { deals } = routes(modules);
  state.user = { id: "admin", email: "ops@example.com" }; state.allowed = true;
  await check(deals.POST, { buyer_lead_id: id }, 400);
  await check(deals.POST, { land_id: id }, 400);
  await check(deals.POST, { buyer_lead_id: id, land_id: "x" }, 400);
  await check(deals.POST, { buyer_lead_id: id, listing_title: "T", deal_value: -1 }, 400);
  await check(deals.POST, { buyer_lead_id: id, listing_title: "T", stage: "won" }, 400);
  await check(deals.POST, { buyer_lead_id: id, title: "Old field" }, 400);
  assert.equal(state.dbCalls, 0);
  await check(deals.POST, { buyer_lead_id: id, listing_title: "Title only" }, 201);
  assert.equal((await check(deals.POST, { buyer_lead_id: id, land_id: id, deal_value: 1_000_000 }, 201)).body.id, id);
  assert.equal(state.events.at(-1)!.eventType, "crm_deal_created");
  await check(deals.POST, { buyer_lead_id: id, listing_ref: "LMT-1" }, 201);
  state.createResult = { kind: "duplicate", id };
  assert.equal((await check(deals.POST, { buyer_lead_id: id, land_id: id }, 409)).body.id, id);
  state.createResult = { kind: "lead_not_found" };
  await check(deals.POST, { buyer_lead_id: id, land_id: id }, 404);
  state.createError = Object.assign(new Error("private SQL"), { code: "23505" });
  await check(deals.POST, { buyer_lead_id: id, land_id: id }, 409);
  state.createError = Object.assign(new Error("private SQL"), { code: "23503" });
  await check(deals.POST, { buyer_lead_id: id, land_id: id }, 422);
  state.createError = new Error("private SQL");
  await check(deals.POST, { buyer_lead_id: id, land_id: id }, 500);
});

test("deal PATCH: won closes deal and wins lead, lost cancels without touching lead, reopen clears close", async () => {
  const { state, modules } = harness();
  const { deal } = routes(modules);
  state.user = { id: "admin", email: "ops@example.com" }; state.allowed = true;
  await check(deal.PATCH, { expected_updated_at: version }, 400);
  await check(deal.PATCH, { expected_updated_at: version, stage: "closed" }, 400);
  await check(deal.PATCH, { expected_updated_at: version, stage: "won", status: "in_progress" }, 422);
  await check(deal.PATCH, { expected_updated_at: "2026-10-01T00:00:00Z", stage: "won" }, 409);
  assert.equal(state.dealUpdates.length, 0);

  await check(deal.PATCH, { expected_updated_at: version, stage: "won", deal_value: 5_000_000 }, 200);
  let [, , dealState, conversion, leadLog] = state.dealUpdates.at(-1) as [string, unknown, Record<string, unknown>, string, { to: string }[]];
  assert.deepEqual(dealState, { ok: true, stage: "won", status: "closed", closedAt: "set" });
  assert.equal(conversion, "won"); assert.equal(leadLog[0].to, "won");
  assert.deepEqual(state.events.map((event) => event.eventType), ["crm_deal_updated", "crm_lead_updated"]);

  state.events = [];
  await check(deal.PATCH, { expected_updated_at: version, stage: "lost" }, 200);
  [, , dealState, conversion, leadLog] = state.dealUpdates.at(-1) as [string, unknown, Record<string, unknown>, string, { to: string }[]];
  assert.deepEqual(dealState, { ok: true, stage: "lost", status: "cancelled", closedAt: "set" });
  assert.equal(conversion, "none"); assert.equal(leadLog.length, 0);
  assert.deepEqual(state.events.map((event) => event.eventType), ["crm_deal_updated"]);

  state.deal = { ...state.deal!, stage: "won", status: "closed" };
  await check(deal.PATCH, { expected_updated_at: version, stage: "deposit" }, 200);
  [, , dealState, conversion] = state.dealUpdates.at(-1) as [string, unknown, Record<string, unknown>, string, unknown];
  assert.deepEqual(dealState, { ok: true, stage: "deposit", status: "in_progress", closedAt: "clear" });
  assert.equal(conversion, "unwon");
  await check(deal.PATCH, { expected_updated_at: version, status: "in_progress" }, 422);
});

test("SQL contracts: lost never updates leads, conversion only while won, create checks duplicates", () => {
  const sql = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
  const update = sql.slice(sql.indexOf("export async function updateDeal"));
  assert.match(update, /update leads l set status = 'won'/);
  assert.match(update, /where \$12 = 'won' and l\.id = u\.buyer_lead_id/);
  assert.doesNotMatch(update, /status = 'lost'/);
  assert.match(update, /set converted = \(\$12 = 'won'\)/);
  const create = sql.slice(sql.indexOf("export async function createDeal"), sql.indexOf("export async function updateDeal"));
  assert.match(create, /on conflict do nothing/);
  assert.match(create, /where not exists \(select 1 from existing\)/);
  assert.doesNotMatch(create, /converted/);
  assert.match(create, /'in_progress', 'qualified'/);
});

test("ordinary deal updates reject commission changes and SQL cannot write commission", async () => {
  const { state, modules } = harness();
  state.user = { id: "admin", email: "ops@example.com" }; state.allowed = true;
  const { deal } = routes(modules);
  for (const expected_commission of [0, 100, null]) {
    const body = { expected_updated_at: version, notes: "Other edit", expected_commission };
    assert.equal(schemas.dealUpdateSchema.safeParse(body).success, false);
    await check(deal.PATCH, body, 400);
  }
  assert.equal(state.dbCalls, 0);
  assert.equal(state.events.length, 0);
  const calls: { sql: string; params: unknown[] }[] = [];
  const queries = load<{ updateDeal: (...args: unknown[]) => Promise<unknown> }>("./queries.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params }); return [{ id }];
    } }) },
  });
  // Even an unvalidated caller cannot get a commission field into the SQL.
  await queries.updateDeal(id, { expected_updated_at: version, deal_value: 50, assigned_to: "ops", notes: "edit", expected_commission: 987654 },
    { ok: true, stage: "offer", status: "in_progress", closedAt: "keep" }, "none", []);
  assert.doesNotMatch(calls[0].sql, /expected_commission|commission_paid/);
  assert.deepEqual(Array.from(calls[0].params), [id, "offer", "in_progress", "keep", true, 50, true, "ops", true, "edit", version, "none", "[]"]);
  const forms = readFileSync(new URL("../../components/admin/OperationsForms.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(forms.slice(forms.indexOf("export function DealUpdateForm")), /expected_commission/);
});

test("deal creation keeps nonnegative finite commission validation", () => {
  const body = { buyer_lead_id: id, listing_title: "Property" };
  for (const expected_commission of [-1, NaN, Infinity, -Infinity, 1e15, "100"]) {
    assert.equal(schemas.dealCreateSchema.safeParse({ ...body, expected_commission }).success, false);
  }
  for (const expected_commission of [0, 100.50, null]) {
    assert.equal(schemas.dealCreateSchema.safeParse({ ...body, expected_commission }).success, true);
  }
});

test("anonymous events cannot forge audit events and analytics metadata is sanitized", async () => {
  const { state, modules } = harness();
  let eventsAllowed = true;
  const { POST } = load<{ POST: Handler }>("../../app/api/events/route.ts", { ...modules, zod,
    "@/lib/security/rate-limit": { checkRateLimit: async () => ({ allowed: eventsAllowed, retryAfterSeconds: eventsAllowed ? 0 : 60, degraded: false }) },
    "@/lib/security/http": { readJsonBody: async (req: { json: () => Promise<unknown> }) => ({ tooLarge: false, body: await req.json().catch(() => null) }) },
  });
  const send = async (body: unknown) => {
    const response = await POST(request(body), {});
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.headers["Cache-Control"], "no-store");
  };
  const meta = { actor_id: "admin", admin_id: "admin", override: true, override_reason: "forged", actorId: "admin", nested: { admin_id: "admin" } };
  for (const event_type of ["deal_commission_changed", "deal_commission_paid", "crm_lead_updated", "crm_deal_created", "crm_anything", "partner_created", "partner_anything", "unknown"]) {
    await send({ event_type, meta });
  }
  assert.equal(state.events.length, 0);
  for (const event_type of ["page_view", "search", "listing_view", "contact_click"]) {
    await send({ event_type, entity_type: "listing", entity_id: id, session_id: "anonymous", admin_id: "admin",
      meta: { ...meta, path: "/listings", query: "land", contact_method: "line" } });
    const event = state.events.at(-1)!;
    assert.equal(event.eventType, event_type);
    assert.equal(event.entityType, "listing");
    assert.equal(event.entityId, id);
    assert.equal(event.sessionId, "anonymous");
    assert.equal(JSON.stringify(event.meta), JSON.stringify({ path: "/listings", query: "land", contact_method: "line" }));
  }
  await send({ event_type: "page_view", meta });
  assert.equal(JSON.stringify(state.events.at(-1)!.meta), "{}");
  const count = state.events.length;
  await send({ event_type: "page_view", entity_type: "deal", meta });
  await send({ event_type: "search", meta: { query: { admin_id: "admin" } } });
  await send({ event_type: "search", meta: { query: "x".repeat(201) } });
  assert.equal(state.events.length, count);
  eventsAllowed = false;
  await send({ event_type: "page_view" });
  assert.equal(state.events.length, count, "rate-limited analytics events are dropped, not written");
  eventsAllowed = true;
  const response = await POST({ json: async () => { throw new Error("bad JSON"); } }, {});
  assert.equal(response.body.ok, true);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("admin pages gate rendering on the server session and stay out of search indexes", () => {
  for (const path of ["leads/page.tsx", "leads/[id]/page.tsx", "deals/page.tsx", "deals/[id]/page.tsx"]) {
    const source = readFileSync(new URL(`../../app/admin/${path}`, import.meta.url), "utf8");
    assert.match(source, /export const dynamic = "force-dynamic"/, path);
    assert.match(source, /robots: \{ index: false, follow: false \}/, path);
    const gate = source.indexOf("isAdminUserAllowed(user)");
    assert.ok(source.indexOf("await getSessionUser()") > 0 && gate > 0, path);
    for (const read of ["listLeads(", "getLead(", "listDeals(", "getDeal(", "getAssignees("]) {
      const at = source.indexOf(read, source.indexOf("export default"));
      if (at >= 0) assert.ok(at > gate, `${path} reads ${read} before the admin gate`);
    }
  }
  const forms = readFileSync(new URL("../../components/admin/OperationsForms.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(forms, /isAdmin|role:/);
});
