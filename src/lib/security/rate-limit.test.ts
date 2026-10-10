import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
import * as nodeNet from "node:net";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadSource<T>(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  runInNewContext(compiled.outputText, {
    exports, require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
      return modules[name];
    }, ...globals,
  });
  return exports as T;
}

const { clientIp } = loadSource<typeof import("./client-ip.ts")>("./client-ip.ts", { "node:net": nodeNet });
const ip = (h: Record<string, string>) => clientIp(new Headers(h));

test("clientIp prefers x-real-ip and uses only the first forwarded entry otherwise", () => {
  assert.equal(ip({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), "203.0.113.9");
  assert.equal(ip({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), "1.1.1.1");
  assert.equal(ip({ "x-forwarded-for": " 198.51.100.7:4433 , 9.9.9.9" }), "198.51.100.7");
});

test("clientIp rejects garbage and missing headers", () => {
  assert.equal(ip({}), "unknown");
  for (const bad of ["garbage", "999.1.1.1", "1.2.3", "::1::2", "a".repeat(500), "'; drop table x;--", "1:2:3:4:5:6:7:8:9"]) {
    assert.equal(ip({ "x-real-ip": bad }), "unknown", bad);
  }
});

test("clientIp buckets IPv6 by /64 and unwraps mapped IPv4", () => {
  const a = ip({ "x-real-ip": "2001:db8:1:2::1" });
  assert.equal(a, "2001:db8:1:2::/64");
  assert.equal(ip({ "x-real-ip": "2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd" }), a);
  assert.equal(ip({ "x-real-ip": "[2001:db8:1:2:ffff::9]:443" }), a);
  assert.equal(ip({ "x-real-ip": "2001:db8:1:2::1%eth0" }), a);
  assert.notEqual(ip({ "x-real-ip": "2001:db8:1:3::1" }), a);
  assert.equal(ip({ "x-real-ip": "::ffff:203.0.113.5" }), "203.0.113.5");
  assert.equal(ip({ "x-real-ip": "::ffff:cb00:7105" }), "203.0.113.5");
  assert.equal(ip({ "x-real-ip": "::1" }), "0:0:0:0::/64");
});

type Row = { retry_after: unknown };
function load(dbImpl: (sql: string, values: unknown[]) => Promise<Row[]>, env: Record<string, string> = {}) {
  let now = 1_000_000_000_000;
  const logs: unknown[][] = [];
  const mod = loadSource<typeof import("./rate-limit.ts")>("./rate-limit.ts", {
    "node:crypto": nodeCrypto,
    "@/lib/neon/server": { getSql: () => ({ query: dbImpl }) },
    "@/lib/security/client-ip": { clientIp },
  }, { process: { env }, Date: { now: () => now }, console: { error: (...a: unknown[]) => logs.push(a) } });
  return { ...mod, logs, advance: (ms: number) => { now += ms; } };
}
const hdr = (addr: string) => new Headers({ "x-real-ip": addr });
const down = async () => { throw new Error("db down"); };

test("checkRateLimit sends one consume_rate_limit call with hashed client and route limits", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const rl = load(async (sql, values) => { calls.push({ sql, values }); return [{ retry_after: 0 }]; });
  const result = await rl.checkRateLimit("leads", hdr("203.0.113.77"));
  assert.deepEqual({ ...result }, { allowed: true, retryAfterSeconds: 0, degraded: false });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /consume_rate_limit\(\$1,\$2,\$3,\$4,\$5\)/);
  const [bucket, digest, limit, globalLimit, windowSeconds] = calls[0].values;
  assert.equal(bucket, "leads");
  assert.match(String(digest), /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(calls[0].values).includes("203.0.113.77"), false);
  assert.deepEqual([limit, globalLimit, windowSeconds], [5, 300, 600]);
  await rl.checkRateLimit("leads", hdr("203.0.113.78"));
  assert.notEqual(calls[1].values[1], digest);
  await rl.checkRateLimit("events", hdr("203.0.113.77"));
  assert.notEqual(calls[2].values[1], digest);
});

test("checkRateLimit denies with retry-after when the database says so", async () => {
  const rl = load(async () => [{ retry_after: 37 }]);
  assert.deepEqual({ ...(await rl.checkRateLimit("leads", hdr("203.0.113.1"))) }, { allowed: false, retryAfterSeconds: 37, degraded: false });
});

test("database failure falls back to a stricter per-process limit that still denies", async () => {
  const rl = load(down);
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await rl.checkRateLimit("leads", hdr("203.0.113.1")));
  assert.deepEqual(results.map((r) => r.allowed), [true, true, true, false]); // ceil(5/2) = 3
  assert.ok(results.every((r) => r.degraded));
  assert.ok(results[3].retryAfterSeconds >= 1 && results[3].retryAfterSeconds <= 600);
  assert.equal(rl.logs.length, 1);
  assert.equal(JSON.stringify(rl.logs).includes("203.0.113"), false);
  rl.advance(601_000);
  assert.equal((await rl.checkRateLimit("leads", hdr("203.0.113.1"))).allowed, true);
});

test("fallback global ceiling applies across clients and per route", async () => {
  const rl = load(down);
  let allowed = 0;
  for (let i = 0; i < 100; i++) if ((await rl.checkRateLimit("property_draft_submit", hdr(`198.51.100.${i}`))).allowed) allowed++;
  assert.equal(allowed, 20); // ceil(200 / 10)
  assert.equal((await rl.checkRateLimit("leads", hdr("198.51.100.250"))).allowed, true);
});

test("fallback global exhaustion denies new and repeat keys without any clear-all reset", async () => {
  const rl = load(down);
  const route = "events"; // per-client fallback 150, global fallback 2000
  for (let i = 0; i < 2_000; i++) await rl.checkRateLimit(route, new Headers({ "x-real-ip": `10.${i >> 8}.${i & 255}.1` }));
  // global exhausted: a brand new client is denied, and so is a repeat client (no reset by pruning/clearing)
  assert.equal((await rl.checkRateLimit(route, hdr("192.0.2.1"))).allowed, false);
  assert.equal((await rl.checkRateLimit(route, hdr("10.0.0.1"))).allowed, false);
});

test("nonsense database values are degraded fallback, not allow-all", async () => {
  for (const bad of [null, undefined, "0", -1, Number.NaN, {}]) {
    const rl = load(async () => [{ retry_after: bad }]);
    const out = [];
    for (let i = 0; i < 4; i++) out.push(await rl.checkRateLimit("leads", hdr("203.0.113.1")));
    assert.ok(out.every((r) => r.degraded), String(bad));
    assert.equal(out[3].allowed, false, String(bad));
  }
  const empty = load(async () => []);
  assert.equal((await empty.checkRateLimit("leads", hdr("203.0.113.1"))).degraded, true);
});

test("RATE_LIMITS covers every route with sane values", () => {
  const { RATE_LIMITS } = load(down);
  assert.equal(Object.keys(RATE_LIMITS).length, 8);
  for (const v of Object.values(RATE_LIMITS)) assert.ok(v.limit >= 1 && v.globalLimit > v.limit && v.windowSeconds >= 60);
});

test("migration is atomic, lock-free, uncapped, private", () => {
  const sql = readFileSync(new URL("../../../db/migrations/20261009_public_write_rate_limits.sql", import.meta.url), "utf8");
  assert.match(sql, /on conflict \(bucket, client_hash\)/);
  assert.equal(sql.includes("pg_advisory_xact_lock"), false);
  assert.equal(/count\(\*\)/i.test(sql), false);
  // Cleanup must not wait on rows held by concurrent calls (reproduced deadlock on PG18 without it).
  assert.match(sql, /limit 100\s+for update skip locked\);/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public_write_rate_limits from public/);
  assert.match(sql, /revoke all on function consume_rate_limit\(text, text, int, int, int\) from public/);
  assert.match(sql, /array\[''anonymous'',''authenticated'',''anon''\]/);
  assert.match(sql, /primary key \(bucket, client_hash\)/);
  assert.match(sql, /\^\(\[0-9a-f\]\{64\}\|\\\*\)\$/);
  assert.match(sql, /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
