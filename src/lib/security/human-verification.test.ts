import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Mod = typeof import("./human-verification");
const source = readFileSync(new URL("./human-verification.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });

// Cloudflare's public documented dummy secret (always passes); not a real key.
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const realFetch = globalThis.fetch;
const envKeys = ["HUMAN_VERIFICATION_REQUIRED", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAMES"] as const;
let calls: { url: string; init: RequestInit }[] = [];

function load(): Mod {
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, process, console: { error() {} }, crypto, AbortSignal, Headers,
    fetch: (url: string, init: RequestInit) => globalThis.fetch(url, init),
  });
  return exports as Mod;
}
function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return impl(url, init); }) as typeof fetch;
}
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const withToken = (token?: string) => new Headers(token === undefined ? {} : { "x-turnstile-token": token });
function enable(secret: string | undefined = TEST_SECRET) {
  process.env.HUMAN_VERIFICATION_REQUIRED = "true";
  if (secret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = secret;
}

afterEach(() => { globalThis.fetch = realFetch; for (const key of envKeys) delete process.env[key]; });

test("disabled by default: ok with no network call", async () => {
  mockFetch(json({ success: true }));
  const m = load();
  assert.equal(m.humanVerificationRequired(), false);
  assert.deepEqual(plain(await m.verifyHuman(withToken(), "1.2.3.4")), { ok: true });
  assert.equal(calls.length, 0);
});

test("only exact 'true' enables (TRUE, 1, yes do not); value is trimmed", async () => {
  const m = load();
  for (const value of ["TRUE", "True", "1", "yes", "false", ""]) {
    process.env.HUMAN_VERIFICATION_REQUIRED = value;
    assert.equal(m.humanVerificationRequired(), false, value);
  }
  process.env.HUMAN_VERIFICATION_REQUIRED = " true ";
  assert.equal(m.humanVerificationRequired(), true);
});

test("required without secret fails closed with 503 and no fetch", async () => {
  mockFetch(json({ success: true }));
  enable("   ");
  const result = await load().verifyHuman(withToken("tok"), "1.2.3.4");
  assert.deepEqual(plain({ ...result, error: undefined }), { ok: false, status: 503, code: "human_verification_unavailable" });
  assert.equal(calls.length, 0);
});

test("missing, empty and oversized tokens give 403 without fetch", async () => {
  mockFetch(json({ success: true }));
  enable();
  const m = load();
  for (const headers of [withToken(), withToken("  "), withToken("x".repeat(2049))]) {
    const result = await m.verifyHuman(headers, "1.2.3.4");
    assert.ok(!result.ok && result.status === 403 && result.code === "human_verification_failed" && result.error.length > 0);
  }
  assert.equal(calls.length, 0);
  mockFetch(json({ success: true }));
  assert.deepEqual(plain(await m.verifyHuman(withToken("x".repeat(2048)), "1.2.3.4")), { ok: true });
});

test("success posts secret, response, remoteip, idempotency_key to siteverify", async () => {
  mockFetch(json({ success: true, hostname: "example.com" }));
  enable();
  assert.deepEqual(plain(await load().verifyHuman(withToken("tok-1"), "203.0.113.9")), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].init.signal);
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.secret, TEST_SECRET);
  assert.equal(body.response, "tok-1");
  assert.equal(body.remoteip, "203.0.113.9");
  assert.match(body.idempotency_key, /^[0-9a-f-]{36}$/);
});

test("remoteip omitted for 'unknown' and CIDR-like values", async () => {
  enable();
  const m = load();
  for (const ip of ["unknown", "2001:db8::/64", ""]) {
    mockFetch(json({ success: true }));
    await m.verifyHuman(withToken("tok"), ip);
    assert.ok(!("remoteip" in JSON.parse(String(calls[0].init.body))), ip);
  }
});

test("success:false gives 403", async () => {
  mockFetch(json({ success: false, "error-codes": ["invalid-input-response"] }));
  enable();
  const result = await load().verifyHuman(withToken("bad"), "1.2.3.4");
  assert.ok(!result.ok && result.status === 403 && result.code === "human_verification_failed");
});

test("network error, timeout and non-200 give 503 (fail closed)", async () => {
  enable();
  const m = load();
  for (const impl of [
    async () => { throw new TypeError("network"); },
    async () => { throw new DOMException("timeout", "TimeoutError"); },
    json({ success: true }, 500),
    json({ success: true }, 429),
  ]) {
    mockFetch(impl);
    const result = await m.verifyHuman(withToken("tok"), "1.2.3.4");
    assert.ok(!result.ok && result.status === 503 && result.code === "human_verification_unavailable");
  }
  mockFetch(async () => new Response("not json", { status: 200 }));
  const result = await m.verifyHuman(withToken("tok"), "1.2.3.4");
  assert.ok(!result.ok && result.status === 503);
});

test("hostname allowlist: mismatch or missing hostname 403, match ok (case-insensitive)", async () => {
  enable();
  process.env.TURNSTILE_EXPECTED_HOSTNAMES = "landmarketthai.com, www.landmarketthai.com";
  const m = load();
  mockFetch(json({ success: true, hostname: "evil.example" }));
  assert.ok(!(await m.verifyHuman(withToken("t"), "1.2.3.4")).ok);
  mockFetch(json({ success: true }));
  assert.ok(!(await m.verifyHuman(withToken("t"), "1.2.3.4")).ok);
  mockFetch(json({ success: true, hostname: "WWW.landmarketthai.com" }));
  assert.deepEqual(plain(await m.verifyHuman(withToken("t"), "1.2.3.4")), { ok: true });
});

test("secret is never present in returned errors", async () => {
  mockFetch(json({ success: false }));
  enable();
  assert.ok(!JSON.stringify(await load().verifyHuman(withToken("t"), "1.2.3.4")).includes(TEST_SECRET));
});
