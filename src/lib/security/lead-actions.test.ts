import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validations from "../validations.ts";
import * as clientIpModule from "./client-ip.ts";
import * as zoning from "../zoning.ts";

// Executes the real Server Actions (src/app/actions/leads.ts) and the real Turnstile verifier.
// Only next/headers, the Neon limiter, the DB and the network (Siteverify + n8n) are in-memory.
function load<T>(path: string, modules: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  runInNewContext(compiled.outputText, {
    exports, console: { error() {} }, process, crypto, Headers, AbortSignal,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
      return modules[name];
    },
  });
  return exports as T;
}

type State = { status: string; id?: string; message?: string };
type Action = (prev: State, formData: FormData) => Promise<State>;
type Actions = { submitPartnerLead: Action; submitOwnerLead: Action; submitBuyerLead: Action };

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const realFetch = globalThis.fetch;

function harness() {
  const state = {
    limit: { allowed: true, retryAfterSeconds: 0, degraded: false },
    siteverify: { success: true } as Record<string, unknown>,
    limited: [] as { route: string; ip: string }[],
    verifyBodies: [] as Record<string, string>[],
    leads: 0,
    webhooks: 0,
  };
  const human = load<Record<string, unknown>>("./human-verification.ts", {});
  const actions = load<Actions>("../../app/actions/leads.ts", {
    "next/headers": { headers: async () => new Headers({ "x-real-ip": "203.0.113.9", "x-turnstile-token": "header-token-ignored" }) },
    "@/lib/neon/mutations": {
      insertLead: async () => { state.leads++; return "lead-1"; },
      insertReferralAttribution: async () => {},
      resolveActivePartner: async () => null,
    },
    "@/lib/validations": validations,
    "@/lib/zoning": zoning,
    "@/lib/security/client-ip": clientIpModule,
    "@/lib/security/human-verification": human,
    "@/lib/security/rate-limit": {
      checkRateLimit: async (route: string, headers: Headers) => {
        state.limited.push({ route, ip: clientIpModule.clientIp(headers) });
        return state.limit;
      },
    },
  });
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) === SITEVERIFY) {
      state.verifyBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(state.siteverify), { status: 200 });
    }
    state.webhooks++;
    return new Response("ok");
  }) as typeof fetch;
  process.env.N8N_WEBHOOK_LEADS = "https://n8n.invalid/webhook";
  return { state, actions };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const base = { name: "Somchai", phone: "081-234-5678", consent_pdpa: "on" };
const cases: [keyof Actions, Record<string, string>][] = [
  ["submitPartnerLead", base],
  ["submitOwnerLead", { ...base, province: "ระยอง", size_rai: "37" }],
  ["submitBuyerLead", base],
];
const idle = { status: "idle" };

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ["HUMAN_VERIFICATION_REQUIRED", "TURNSTILE_SECRET_KEY", "N8N_WEBHOOK_LEADS"]) delete process.env[key];
});

function enableHuman() {
  process.env.HUMAN_VERIFICATION_REQUIRED = "true";
  // Cloudflare's public documented dummy secret; Siteverify itself is mocked.
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
}

test("flag off: all three actions stay backward compatible but consume the shared 'leads' limiter by real client IP", async () => {
  const { state, actions } = harness();
  for (const [name, fields] of cases) {
    const result = await actions[name](idle, form(fields));
    assert.equal(result.status, "success", name);
  }
  assert.equal(state.leads, 3);
  assert.equal(state.webhooks, 3);
  assert.equal(state.verifyBodies.length, 0, "no Siteverify call while the flag is off");
  assert.deepEqual(state.limited, cases.map(() => ({ route: "leads", ip: "203.0.113.9" })));
});

test("rate-limited: all three actions return an error with no DB write and no n8n webhook", async () => {
  const { state, actions } = harness();
  state.limit = { allowed: false, retryAfterSeconds: 30, degraded: false };
  for (const [name, fields] of cases) {
    const result = await actions[name](idle, form(fields));
    assert.equal(result.status, "error", name);
    assert.match(String(result.message), /บ่อยเกินไป/);
  }
  assert.equal(state.leads + state.webhooks, 0);
});

test("rate-limited honeypot submissions are still blocked without writes", async () => {
  const { state, actions } = harness();
  state.limit = { allowed: false, retryAfterSeconds: 30, degraded: false };
  for (const [name, fields] of cases) {
    assert.equal((await actions[name](idle, form({ ...fields, _hp: "bot" }))).status, "error", name);
  }
  assert.equal(state.leads + state.webhooks, 0);
});

test("flag on: missing token (or a forged client boolean / header) is rejected before limiter, DB and webhook", async () => {
  enableHuman();
  const { state, actions } = harness();
  for (const [name, fields] of cases) {
    const result = await actions[name](idle, form({ ...fields, human_verified: "true", turnstile_token: "  " }));
    assert.equal(result.status, "error", name);
    assert.match(String(result.message), /ไม่ใช่บอท/);
  }
  assert.equal(state.verifyBodies.length, 0, "empty token never reaches Siteverify");
  assert.equal(state.limited.length, 0, "token-less bots must not burn the shared ceiling");
  assert.equal(state.leads + state.webhooks, 0);
});

test("flag on: FormData token is verified server-side with Siteverify; failure blocks, success writes", async () => {
  enableHuman();
  const { state, actions } = harness();
  state.siteverify = { success: false, "error-codes": ["invalid-input-response"] };
  for (const [name, fields] of cases) {
    assert.equal((await actions[name](idle, form({ ...fields, turnstile_token: "bad-token" }))).status, "error", name);
  }
  assert.equal(state.leads + state.webhooks + state.limited.length, 0);

  state.siteverify = { success: true };
  for (const [name, fields] of cases) {
    assert.equal((await actions[name](idle, form({ ...fields, turnstile_token: `tok-${name}` }))).status, "success", name);
  }
  assert.equal(state.leads, 3);
  assert.equal(state.webhooks, 3);
  assert.equal(state.limited.length, 3);
  const lastThree = state.verifyBodies.slice(-3);
  assert.deepEqual(lastThree.map((body) => body.response), cases.map(([name]) => `tok-${name}`));
  assert.ok(lastThree.every((body) => body.remoteip === "203.0.113.9" && body.secret && body.idempotency_key));
});

test("flag on without TURNSTILE_SECRET_KEY fails closed for server actions", async () => {
  process.env.HUMAN_VERIFICATION_REQUIRED = "true";
  const { state, actions } = harness();
  for (const [name, fields] of cases) {
    assert.equal((await actions[name](idle, form({ ...fields, turnstile_token: "tok" }))).status, "error", name);
  }
  assert.equal(state.leads + state.webhooks + state.verifyBodies.length, 0);
});

test("every caller of the lead server actions embeds the Turnstile token and resets it after each attempt", () => {
  const srcDir = new URL("../../", import.meta.url);
  const callers = (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
    .filter((file) => /actions\/leads["']/.test(readFileSync(new URL(file.replaceAll("\\", "/"), srcDir), "utf8")))
    .map((file) => file.replaceAll("\\", "/"));
  assert.deepEqual(callers, ["components/forms/PartnerForm.tsx"], "new callers must wire Turnstile too");

  const partner = readFileSync(new URL("../../components/forms/PartnerForm.tsx", import.meta.url), "utf8");
  assert.match(partner, /<input type="hidden" name="turnstile_token" value=\{turnstile\.token \?\? ""\} \/>/);
  assert.match(partner, /<TurnstileWidget[^>]*resetKey=\{turnstile\.resetKey\}/);
  assert.match(partner, /formAction\(formData\);\s*turnstile\.reset\(\);/);
  assert.match(partner, /<form action=\{submit\}/);
  assert.match(partner, /disabled=\{isPending \|\| \(turnstile\.enabled && !turnstile\.token\)\}/);
});

test("Turnstile load or challenge failure tells the user why submit stays disabled", () => {
  const widget = readFileSync(new URL("../../components/security/TurnstileWidget.tsx", import.meta.url), "utf8");
  assert.match(widget, /"error-callback": \(\) => \{ setFailed\(true\);/);
  assert.match(widget, /\.catch\(\(\) => \{ setFailed\(true\);/);
  assert.match(widget, /callback: \(token: string\) => \{ setFailed\(false\);/);
  assert.match(widget, /\{failed && <p role="alert"/);
});
