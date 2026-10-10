import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
import * as nodeNet from "node:net";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Codex P1: ~50 IPs x 10 tokenless POST /api/property-submissions exhausted the 500/hr global draft quota.
// Runs the real route, guardPublicWrite, Turnstile verifier, limiter and client-IP code. Only the DB
// (an in-memory mirror of consume_rate_limit: client row first, then the global '*' row) and
// Cloudflare Siteverify (single-use tokens, as documented) are faked.
function load<T>(path: string, modules: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  runInNewContext(compiled.outputText, {
    exports, process, crypto, Buffer, URL, Headers, AbortSignal, console: { error() {} },
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    require: (name: string) => { assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`); return modules[name]; },
  });
  return exports as T;
}

type Reply = { status: number; body: Record<string, unknown>; headers: Record<string, string> };
const NextResponse = { json: (body: Record<string, unknown>, init: { status?: number; headers?: Record<string, string> } = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }) };
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const realFetch = globalThis.fetch;
const envKeys = ["VERCEL_ENV", "HUMAN_VERIFICATION_REQUIRED", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAMES", "RATE_LIMIT_SECRET"];
afterEach(() => { globalThis.fetch = realFetch; for (const key of envKeys) delete process.env[key]; });

function harness(options: { siteverifyDown?: boolean } = {}) {
  const rows = new Map<string, number>();
  const state = { dbCalls: 0, siteverifyCalls: 0, drafts: 0, issued: new Set<string>(), spent: new Set<string>() };
  const consume = (bucket: string, client: string, limit: number, globalLimit: number, windowSeconds: number) => {
    state.dbCalls++;
    const key = `${bucket}:${client}`;
    const count = Math.min((rows.get(key) ?? 0) + 1, limit + 1);
    rows.set(key, count);
    if (count > limit) return windowSeconds;
    const global = Math.min((rows.get(`${bucket}:*`) ?? 0) + 1, globalLimit + 1);
    rows.set(`${bucket}:*`, global);
    return global > globalLimit ? windowSeconds : 0;
  };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    assert.equal(String(url), SITEVERIFY, "no other network calls");
    state.siteverifyCalls++;
    if (options.siteverifyDown) throw new TypeError("fetch failed");
    const { response } = JSON.parse(String(init?.body));
    // Cloudflare: a token validates once; replays fail with timeout-or-duplicate.
    const ok = state.issued.has(response) && !state.spent.has(response);
    state.spent.add(response);
    return new Response(JSON.stringify(ok ? { success: true, hostname: "landmarketthai.com" } : { success: false, "error-codes": ["invalid-input-response"] }), { status: 200 });
  }) as typeof fetch;

  const clientIp = load<Record<string, unknown>>("./client-ip.ts", { "node:net": nodeNet });
  const human = load<Record<string, unknown>>("./human-verification.ts", {});
  const rateLimit = load<Record<string, unknown>>("./rate-limit.ts", {
    "node:crypto": nodeCrypto,
    "@/lib/security/client-ip": clientIp,
    "@/lib/neon/server": { getSql: () => ({ query: async (_sql: string, values: [string, string, number, number, number]) => [{ retry_after: consume(...values) }] }) },
  });
  const http = load<Record<string, unknown>>("./http.ts", {
    "next/server": { NextResponse }, "@/lib/security/client-ip": clientIp, "@/lib/security/human-verification": human, "@/lib/security/rate-limit": rateLimit,
  });
  const route = load<{ POST: (request: Request) => Promise<Reply> }>("../../app/api/property-submissions/route.ts", {
    "next/server": { NextResponse }, "@/lib/security/http": http,
    "@/lib/neon/marketplace": { createPropertyDraft: async () => { state.drafts++; return { id: `d${state.drafts}`, token: "t" }; } },
  });
  const post = (ip: string, token?: string) => route.POST(new Request("https://landmarketthai.com/api/property-submissions", {
    method: "POST", headers: { "x-real-ip": ip, ...(token === undefined ? {} : { "x-turnstile-token": token }) },
  }));
  const issue = (token: string) => { state.issued.add(token); return token; };
  const globalCount = () => rows.get("property_draft_create:*") ?? 0;
  return { state, post, issue, globalCount, rows };
}

const botIps = Array.from({ length: 50 }, (_, i) => `198.51.100.${i + 1}`);
function production(secret = "1x0000000000000000000000000000000AA") {
  // Vercel Production with HUMAN_VERIFICATION_REQUIRED left unset (release step 6). Secret is Cloudflare's public dummy.
  process.env.VERCEL_ENV = "production";
  process.env.TURNSTILE_SECRET_KEY = secret;
}

test("exploit closed: 50 IPs x 10 tokenless POSTs get 403, never reach the limiter, and a real seller still gets a draft", async () => {
  production();
  const { state, post, issue, globalCount } = harness();
  for (const ip of botIps) for (let i = 0; i < 10; i++) {
    const reply = await post(ip);
    assert.equal(reply.status, 403);
    assert.equal(reply.body.code, "human_verification_failed");
    assert.equal(reply.headers["Cache-Control"], "no-store");
  }
  assert.equal(state.dbCalls, 0, "tokenless requests never touch the shared limiter");
  assert.equal(globalCount(), 0, "global draft bucket unchanged");
  assert.equal(state.siteverifyCalls, 0, "empty token rejected locally, no Siteverify cost");
  assert.equal(state.drafts, 0);

  const seller = await post("203.0.113.9", issue("cf-seller-1"));
  assert.equal(seller.status, 201);
  assert.equal(state.drafts, 1);
  assert.equal(globalCount(), 1);
});

test("forged tokens and one solved token replayed across 50 IPs: only the first use counts", async () => {
  production();
  const { state, post, issue, globalCount } = harness();
  for (const ip of botIps) assert.equal((await post(ip, `forged-${ip}`)).status, 403);
  const solved = issue("cf-solved-once");
  const replies = await Promise.all(botIps.map((ip) => post(ip, solved)));
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, ...Array(49).fill(403)]);
  assert.equal(state.drafts, 1);
  assert.equal(globalCount(), 1, "only the verified request consumed global quota");
  assert.equal(state.dbCalls, 1);
});

test("fail closed: missing secret or Siteverify outage returns 503 before quota and DB", async () => {
  production("   ");
  let h = harness();
  let reply = await h.post("203.0.113.9", h.issue("cf-1"));
  assert.equal(reply.status, 503);
  assert.equal(reply.body.code, "human_verification_unavailable");
  assert.equal(h.state.siteverifyCalls + h.state.dbCalls + h.state.drafts, 0);

  production();
  h = harness({ siteverifyDown: true });
  for (let i = 0; i < 20; i++) assert.equal((await h.post("203.0.113.9", h.issue(`cf-retry-${i}`))).status, 503, "retries during an outage stay closed");
  assert.equal(h.state.dbCalls + h.state.drafts + h.globalCount(), 0);
});

test("verified seller over the per-IP limit gets 429 + Retry-After without burning global quota", async () => {
  production();
  const { post, issue, globalCount, state } = harness();
  for (let i = 0; i < 10; i++) assert.equal((await post("203.0.113.9", issue(`cf-${i}`))).status, 201);
  for (let i = 10; i < 15; i++) {
    const reply = await post("203.0.113.9", issue(`cf-${i}`));
    assert.equal(reply.status, 429);
    assert.equal(reply.body.code, "rate_limited");
    assert.equal(reply.headers["Retry-After"], "3600");
  }
  assert.equal(globalCount(), 10, "per-client denial happens before the global row is touched");
  assert.equal(state.drafts, 10);
  assert.equal((await post("203.0.113.10", issue("cf-other"))).status, 201, "other sellers unaffected");
});

test("environment gating: strict only on Vercel Production; flag still enforces elsewhere; local dev unchanged", async () => {
  // Local dev / Preview without the flag: tokenless create allowed (no keys needed to develop).
  for (const env of [undefined, "preview", "development"]) {
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
    const { post, state } = harness();
    assert.equal((await post("203.0.113.9")).status, 201, String(env));
    assert.equal(state.siteverifyCalls, 0);
  }
  // Preview UAT with Cloudflare dummy keys + flag: enforced exactly as Production.
  process.env.VERCEL_ENV = "preview";
  process.env.HUMAN_VERIFICATION_REQUIRED = "true";
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  const preview = harness();
  assert.equal((await preview.post("203.0.113.9")).status, 403);
  assert.equal((await preview.post("203.0.113.9", preview.issue("cf-uat"))).status, 201);
  // Production without a secret: strict draft create fails closed, while flag-gated routes keep the old opt-in behaviour.
  delete process.env.HUMAN_VERIFICATION_REQUIRED;
  production("");
  const human = load<{ humanVerificationEnforced: (strict?: boolean) => boolean }>("./human-verification.ts", {});
  assert.equal(human.humanVerificationEnforced(true), true);
  assert.equal(human.humanVerificationEnforced(false), false, "leads/submit still follow HUMAN_VERIFICATION_REQUIRED");
});
