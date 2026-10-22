import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as delivery from "./line/delivery.ts";

const config = { token: "synthetic-token", groupId: `C${"0".repeat(32)}`, siteUrl: "https://landmarketthai.test" };
const retryKey = "123e4567-e89b-42d3-a456-426614174000";
const env = { LINE_NOTIFICATIONS_ENABLED: "true", LINE_CHANNEL_ACCESS_TOKEN: config.token,
  LINE_NOTIFICATION_GROUP_ID: config.groupId, NEXT_PUBLIC_SITE_URL: config.siteUrl, CRON_SECRET: "synthetic-worker-secret-32-characters" };

function load<T>(path: string, modules: Record<string, unknown>, overrides: Record<string, unknown> = {}): T {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env }, Date, console: { error() {}, info() {} },
    require(name: string) { assert.ok(Object.hasOwn(modules, name), `Unmocked dependency ${name}`); return modules[name]; }, ...overrides });
  return exports as T;
}

test("configuration and worker authentication fail closed", () => {
  assert.equal(delivery.lineConfig({}), null);
  assert.equal(delivery.lineConfig({ ...env, LINE_CHANNEL_ACCESS_TOKEN: "" }), null);
  assert.equal(delivery.lineConfig({ ...env, LINE_NOTIFICATION_GROUP_ID: "arbitrary" }), null);
  assert.equal(delivery.lineConfig({ ...env, NEXT_PUBLIC_SITE_URL: "http://example.com" }), null);
  assert.equal(delivery.lineConfig({ ...env, NEXT_PUBLIC_SITE_URL: "https://user:pass@example.com" }), null);
  assert.equal(delivery.lineConfig({ ...env, LINE_NOTIFICATIONS_ENABLED: "false" }), null);
  assert.deepEqual(delivery.lineConfig(env), config);
  for (const header of [null, "Bearer wrong", `Bearer ${env.CRON_SECRET}x`]) assert.equal(delivery.authorizedWorker(header, env.CRON_SECRET), false);
  assert.equal(delivery.authorizedWorker("Bearer short", "short"), false);
  assert.equal(delivery.authorizedWorker(`Bearer ${env.CRON_SECRET}`, env.CRON_SECRET), true);
});

test("all five event messages contain only allowlisted Thai labels and the admin link", () => {
  for (const event of ["buyer", "owner", "partner", "buyer_requirement", "seller_submission"]) {
    const request = delivery.lineRequest(event, config);
    assert.deepEqual(Object.keys(request).sort(), ["messages", "to"]);
    assert.match(request.messages[0].text, /รอทีมงานตรวจสอบ/);
    assert.match(request.messages[0].text, /https:\/\/landmarketthai.test\/admin\/leads$/);
    assert.doesNotMatch(JSON.stringify(request), /phone|email|name|details|attachments|0899990001/);
  }
  assert.throws(() => delivery.lineRequest("toString", config));
  assert.throws(() => delivery.lineRequest("malformed", config));
  assert.notEqual(delivery.requestFingerprint("buyer", config), delivery.requestFingerprint("buyer", { ...config, groupId: `C${"1".repeat(32)}` }));
});

test("LINE success and confirmed duplicate acceptance preserve evidence and the retry UUID", async () => {
  for (const status of [200, 409]) {
    const result = await delivery.pushLine("buyer", retryKey, config, async (url, init) => {
      assert.equal(url, "https://api.line.me/v2/bot/message/push");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Bearer ${config.token}`);
      assert.equal(headers["X-Line-Retry-Key"], retryKey);
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      return new Response("private response body", { status, headers: { "x-line-request-id": "request-id", ...(status === 409 ? { "x-line-accepted-request-id": "accepted-id" } : {}) } });
    });
    assert.equal(result.status, "sent");
    assert.equal(result.requestId, status === 409 ? "accepted-id" : "request-id");
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("network timeout and server failures retry; 429 honors delta/date Retry-After", async () => {
  const timeout = await delivery.pushLine("owner", retryKey, config, async () => { throw new DOMException("private token", "TimeoutError"); });
  assert.deepEqual(timeout, { status: "retry", error: "line_network_or_timeout" });
  for (const status of [408, 429, 500, 503]) {
    const result = await delivery.pushLine("partner", retryKey, config, async () => new Response(null, { status, headers: { "Retry-After": "120" } }));
    assert.equal(result.status, "retry");
    assert.equal(result.retryAfterSeconds, 120);
  }
  const date = await delivery.pushLine("buyer", retryKey, config, async () => new Response(null, { status: 429, headers: { "Retry-After": new Date(Date.now() + 180_000).toUTCString() } }));
  assert.ok(date.retryAfterSeconds! >= 179 && date.retryAfterSeconds! <= 180);
  const invalid = await delivery.pushLine("buyer", retryKey, config, async () => new Response(null, { status: 429, headers: { "Retry-After": "invalid" } }));
  assert.equal(invalid.retryAfterSeconds, 0);
  assert.deepEqual([1,2,3,8].map(n => delivery.retryDelay(n)), [30,60,120,3600]);
  assert.equal(delivery.retryDelay(1, 120), 120);
});

test("permanent 4xx, unconfirmed 409 and invalid UUID never cause unsafe retries", async () => {
  for (const status of [400, 401, 403, 404, 409]) assert.equal((await delivery.pushLine("buyer", retryKey, config, async () => new Response(null, { status }))).status, "failed");
  assert.equal((await delivery.pushLine("buyer", "bad-id", config, async () => { throw Error("must not send"); })).error, "invalid_retry_key");
});

function worker(result: delivery.DeliveryResult, attempts = 1, fingerprint: string | null = null, failFinish = false) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let claimed = false, sends = 0;
  const outbox = load<typeof import("./line/outbox.ts")>("./line/outbox.ts", {
    "@/lib/neon/server": { getSql: () => ({ query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("returning o.*")) {
        if (claimed) return [];
        claimed = true;
        return [{ id: "job", lease_token: "lease", event_type: "buyer", retry_key: retryKey, attempts, request_fingerprint: fingerprint }];
      }
      if (failFinish && sql.includes("set status=$3")) throw Error("database unavailable after LINE accepted");
      return [{ id: "job" }];
    } }) },
    "@/lib/line/delivery": { ...delivery, lineConfig: () => config, pushLine: async () => { sends++; return result; } },
  });
  return { outbox, queries, sends: () => sends };
}

test("worker persists success, retries, terminal errors and the eighth-attempt limit with lease fencing", async () => {
  for (const [result, attempts, expected] of [
    [{ status: "sent", httpStatus: 200, requestId: "evidence" },1,"sent"],
    [{ status: "retry", error: "line_network_or_timeout" },1,"retry"],
    [{ status: "retry", httpStatus: 429, retryAfterSeconds: 120 },1,"retry"],
    [{ status: "failed", httpStatus: 400 },1,"failed"],
    [{ status: "retry", httpStatus: 503 },8,"failed"],
  ] as [delivery.DeliveryResult, number, string][]) {
    const w = worker(result, attempts);
    await w.outbox.dispatchNotifications();
    const finish = w.queries.find(q => q.sql.includes("set status=$3"))!;
    assert.equal(finish.values[2], expected);
    assert.equal(finish.values[0], "job"); assert.equal(finish.values[1], "lease");
    assert.match(finish.sql, /where id=\$1 and lease_token=\$2 and status='processing'/);
    assert.equal(finish.values[6], delivery.retryDelay(attempts, result.retryAfterSeconds));
    assert.equal(w.sends(), 1);
  }
});

test("configuration drift fails without sending; database failure after acceptance leaves the lease recoverable", async () => {
  const changed = worker({ status: "sent" }, 2, "old-fingerprint");
  await changed.outbox.dispatchNotifications();
  assert.equal(changed.sends(), 0);
  assert.equal(changed.queries.find(q => q.sql.includes("set status=$3"))!.values[3], "request_configuration_changed");
  const interrupted = worker({ status: "sent" }, 1, null, true);
  await assert.rejects(interrupted.outbox.dispatchNotifications());
  assert.equal(interrupted.sends(), 1);
});

test("missing credentials do not claim or consume queued jobs", async () => {
  const outbox = load<typeof import("./line/outbox.ts")>("./line/outbox.ts", {
    "@/lib/neon/server": { getSql() { throw Error("must not query"); } },
    "@/lib/line/delivery": { ...delivery, lineConfig: () => null },
  });
  assert.equal((await outbox.dispatchNotifications()).processed, 0);
});

test("worker route rejects unauthorized calls before any DB access and ignores arbitrary request payloads", async () => {
  let calls = 0;
  const route = load<typeof import("../app/api/internal/line-notifications/route.ts")>("../app/api/internal/line-notifications/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/line/delivery": { ...delivery, lineConfig: () => delivery.lineConfig(env) },
    "@/lib/line/outbox": { dispatchNotifications: async () => { calls++; return { processed: 0 }; }, notificationStats: async () => ({ pending: 0 }) },
  });
  assert.equal((await route.GET(new Request("https://example.test") as never)).status, 401);
  assert.equal(calls, 0);
  const response = await route.POST(new Request("https://example.test", { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` }, body: '{"to":"arbitrary","text":"fabricated"}' }) as never);
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("after scheduling and dispatch failures never change successful business responses", async () => {
  const callbacks: (() => Promise<void>)[] = [];
  const schedule = load<typeof import("./line/schedule.ts")>("./line/schedule.ts", {
    "next/server": { after: (fn: () => Promise<void>) => callbacks.push(fn) },
    "@/lib/line/outbox": { dispatchNotifications: async () => { throw Error("offline"); } },
  });
  schedule.scheduleNotifications(); await callbacks[0]();
  const broken = load<typeof import("./line/schedule.ts")>("./line/schedule.ts", {
    "next/server": { after() { throw Error("runtime ended"); } }, "@/lib/line/outbox": {},
  });
  assert.doesNotThrow(() => broken.scheduleNotifications());
});
