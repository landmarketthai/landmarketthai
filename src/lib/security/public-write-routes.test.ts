import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validations from "../validations.ts";
import * as safeRedirect from "../safe-redirect.ts";

// Real route + real guard code; only the limiter, human check and DB are in-memory.
function load<T>(path: string, modules: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  runInNewContext(compiled.outputText, { exports, console, Buffer, URL, process, AbortSignal, fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args), require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
    return modules[name];
  } });
  return exports as T;
}

type Reply = { status: number; body: Record<string, unknown>; headers: Record<string, string> };
type Handler = (request: Request, context?: unknown) => Promise<Reply>;
const NextResponse = { json: (body: Record<string, unknown>, init: { status?: number; headers?: Record<string, string> } = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }) };

function harness() {
  const state = {
    limit: { allowed: true, retryAfterSeconds: 0, degraded: false },
    human: { ok: true } as Record<string, unknown>,
    limited: [] as string[],
    humanChecks: 0,
    leads: 0,
    webhooks: 0,
    drafts: 0,
  };
  const http = load<Record<string, unknown>>("./http.ts", {
    "next/server": { NextResponse },
    "@/lib/security/client-ip": { clientIp: () => "203.0.113.9" },
    "@/lib/security/rate-limit": { checkRateLimit: async (route: string) => { state.limited.push(route); return state.limit; } },
    "@/lib/security/human-verification": { verifyHuman: async () => { state.humanChecks++; return state.human; } },
  });
  return { state, http };
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://landmarketthai.test/api", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

const validLead = JSON.stringify({ lead_type: "buyer", name: "Somchai", phone: "0812345678", consent_pdpa: true });

function leadsRoute() {
  const { state, http } = harness();
  const route = load<{ POST: Handler }>("../../app/api/leads/route.ts", {
    "next/server": { NextResponse },
    "@/lib/neon/mutations": {
      insertLead: async () => { state.leads++; return "lead-1"; },
      insertReferralAttribution: async () => {},
      resolveActivePartner: async () => null,
    },
    "@/lib/validations": validations,
    "@/lib/security/http": http,
  });
  globalThis.fetch = (async () => { state.webhooks++; return new Response("ok"); }) as typeof fetch;
  process.env.N8N_WEBHOOK_LEADS = "https://n8n.invalid/webhook";
  return { state, POST: route.POST };
}

test("sell wizard forwards the live Turnstile token and resets hook/widget together", () => {
  const wizard = readFileSync(new URL("../../components/forms/SellWizard.tsx", import.meta.url), "utf8");
  assert.match(wizard, /headers:\s*\{\s*"content-type":\s*"application\/json",\s*\.\.\.turnstile\.headers\(\)/);
  assert.match(wizard, /turnstile\.reset\(\)/);
  assert.match(wizard, /<TurnstileWidget[^>]*resetKey=\{turnstile\.resetKey\}/);
  assert.doesNotMatch(wizard, /cf-turnstile-response/, "must not depend on an injected hidden input");
});

test("leads: over-limit clients get 429 + Retry-After before any DB write or n8n webhook", async () => {
  const { state, POST } = leadsRoute();
  assert.equal((await POST(post(validLead))).status, 200);
  assert.equal(state.leads, 1);
  assert.equal(state.webhooks, 1);

  state.limit = { allowed: false, retryAfterSeconds: 42, degraded: false };
  const response = await POST(post(validLead));
  assert.equal(response.status, 429);
  assert.equal(response.body.code, "rate_limited");
  assert.equal(response.headers["Retry-After"], "42");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(state.leads, 1, "no insert after 429");
  assert.equal(state.webhooks, 1, "no webhook amplification after 429");
  assert.deepEqual(state.limited, ["leads", "leads"]);
});

test("leads: failed or unavailable human verification blocks before writes and before consuming rate-limit quota", async () => {
  const { state, POST } = leadsRoute();
  state.human = { ok: false, status: 403, code: "human_verification_failed", error: "bot" };
  let response = await POST(post(validLead));
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "human_verification_failed");
  state.human = { ok: false, status: 503, code: "human_verification_unavailable", error: "down" };
  response = await POST(post(validLead));
  assert.equal(response.status, 503);
  assert.equal(state.leads + state.webhooks, 0);
  assert.equal(state.limited.length, 0, "token-less bots must not burn the shared per-route ceiling");
});

test("leads: oversized bodies get 413 by bytes (not UTF-16 length) and invalid JSON gets 400, not 500", async () => {
  const { state, POST } = leadsRoute();
  // 4,000 Thai characters = 12,000 UTF-8 bytes; the old `text.length > 10_000` check let this through.
  const thai = JSON.stringify({ lead_type: "buyer", name: "ก".repeat(4_000), phone: "0812345678", consent_pdpa: true });
  assert.equal((await POST(post(thai))).status, 413);
  assert.equal((await POST(post("{}", { "content-length": "999999" }))).status, 413);
  assert.equal((await POST(post("{not json"))).status, 400);
  assert.equal((await POST(post("[1,2]"))).status, 400);
  assert.equal(state.leads, 0);
});

test("leads: honeypot still returns a silent ok without writing", async () => {
  const { state, POST } = leadsRoute();
  const response = await POST(post(JSON.stringify({ ...JSON.parse(validLead), _hp: "bot" })));
  assert.equal(response.status, 200);
  assert.equal(state.leads + state.webhooks, 0);
});

test("property draft creation uses the shared limiter instead of a per-process Map", async () => {
  const { state, http } = harness();
  const route = load<{ POST: Handler }>("../../app/api/property-submissions/route.ts", {
    "next/server": { NextResponse },
    "@/lib/neon/marketplace": { createPropertyDraft: async () => { state.drafts++; return { id: "d", token: "t" }; } },
    "@/lib/security/http": http,
  });
  assert.equal((await route.POST(post("{}"))).status, 201);
  state.limit = { allowed: false, retryAfterSeconds: 3600, degraded: false };
  // Different spoofed X-Forwarded-For values no longer matter: the decision is the shared limiter's.
  for (const ip of ["1.1.1.1", "2.2.2.2"]) assert.equal((await route.POST(post("{}", { "x-forwarded-for": ip }))).status, 429);
  assert.equal(state.drafts, 1);
  assert.equal(state.humanChecks, 3, "draft creation is human-checked before the limiter on every attempt");
});

test("every public write route is guarded and no route keeps a per-process rate-limit Map", () => {
  const api = fileURLToPath(new URL("../../app/api/", import.meta.url));
  const files = (readdirSync(api, { recursive: true }) as string[])
    .filter((name) => name.endsWith("route.ts")).map((name) => join(api, name).replaceAll("\\", "/"));
  const expected: Record<string, RegExp> = {
    "leads/route.ts": /guardPublicWrite\(req, "leads", \{ human: true \}\)/,
    "buyer-requirements/route.ts": /guardPublicWrite\(request, "buyer_requirements", \{ human: true \}\)/,
    "property-submissions/route.ts": /guardPublicWrite\(request, "property_draft_create", \{ human: "strict" \}\)/,
    "property-submissions/[id]/submit/route.ts": /guardPublicWrite\(request, "property_draft_submit", \{ human: true \}\)/,
    "property-submissions/[id]/uploads/presign/route.ts": /guardPublicWrite\(request, "submission_upload"\)/,
    "property-submissions/[id]/uploads/confirm/route.ts": /guardPublicWrite\(request, "submission_upload"\)/,
    "uploads/presign/route.ts": /guardPublicWrite\(req, "lead_upload"\)/,
    "uploads/confirm/route.ts": /guardPublicWrite\(req, "lead_upload"\)/,
    "maps-link/route.ts": /guardPublicWrite\(request, "maps_link"\)/,
    "events/route.ts": /checkRateLimit\("events"/,
    "property-submissions/[id]/route.ts": /readJsonBody\(request, 64_000\)/,
  };
  for (const [suffix, pattern] of Object.entries(expected)) {
    const file = files.find((path) => path.endsWith(`/api/${suffix}`));
    assert.ok(file, suffix);
    assert.match(readFileSync(file, "utf8"), pattern, suffix);
  }
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /new Map<string, \{ count/, `${file} keeps a per-process limiter`);
    assert.doesNotMatch(source, /x-forwarded-for/, `${file} parses client IP itself`);
    // Every non-admin, non-auth mutation handler must go through a guard or body cap.
    if (/\/api\/(admin|auth)\//.test(file)) continue;
    if (/export async function (POST|PATCH|PUT|DELETE)/.test(source)) {
      assert.match(source, /guardPublicWrite|checkRateLimit|readJsonBody/, `${file} has an unguarded public mutation`);
    }
  }
});

test("legacy /auth/callback never redirects off-site", async () => {
  const route = load<{ GET: (request: Request) => Promise<{ location: string }> }>("../../app/auth/callback/route.ts", {
    "next/server": { NextResponse: { redirect: (url: URL) => ({ location: url.href }) } },
    "@/lib/safe-redirect": safeRedirect,
  });
  const go = async (next: string) => (await route.GET(new Request(`https://landmarketthai.com/auth/callback?next=${encodeURIComponent(next)}`))).location;
  for (const next of ["/\t/evil.com", "/\n/evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"]) {
    assert.equal(await go(next), "https://landmarketthai.com/", JSON.stringify(next));
  }
  assert.equal(await go("/admin/leads?x=1"), "https://landmarketthai.com/admin/leads?x=1");
});

test("public-read image uploads only accept image MIME types", async () => {
  const { submissionUploadSchema } = await import("../marketplace/schemas.ts");
  const base = { token: "00000000-0000-4000-8000-000000000001", file_name: "a", size_bytes: 10 };
  assert.equal(submissionUploadSchema.safeParse({ ...base, media_kind: "image", mime_type: "application/pdf" }).success, false);
  assert.equal(submissionUploadSchema.safeParse({ ...base, media_kind: "image", mime_type: "image/png" }).success, true);
  assert.equal(submissionUploadSchema.safeParse({ ...base, media_kind: "document", mime_type: "application/pdf" }).success, true);
});
