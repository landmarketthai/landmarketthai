import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const compile = (code: string) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// Route handler with injected next/server, schema and data layer; the real body-cap reader runs (no Next runtime needed).
const nextServer = { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } };
function load(path: string, modules: Record<string, unknown>) {
  const exports: Record<string, (...args: never[]) => Promise<{ status: number; body: unknown }>> = {};
  runInNewContext(compile(read(path)), { exports, Buffer, console: { error() {} }, require: (name: string) => modules[name] });
  return exports;
}
function loadRoute(save: () => Promise<unknown>) {
  const http = load("src/lib/security/http.ts", { "next/server": nextServer });
  const modules: Record<string, unknown> = {
    "next/server": nextServer,
    "@/lib/marketplace/schemas": { draftSchema: { safeParse: (data: unknown) => ({ success: true, data }) } },
    "@/lib/neon/marketplace": { getPropertyDraft: async () => null, savePropertyDraft: save },
    "@/lib/security/http": http,
  };
  return load("src/app/api/property-submissions/[id]/route.ts", modules);
}
const patch = (handler: (...args: never[]) => Promise<{ status: number; body: unknown }>) =>
  (handler as unknown as (request: unknown, context: unknown) => Promise<{ status: number; body: unknown }>)(
    new Request("http://local/api/property-submissions/d", { method: "PATCH", body: JSON.stringify({ token: "t" }) }), { params: Promise.resolve({ id: "d" }) });

test("draft PATCH maps trigger SQLSTATE LZ409 (direct or nested cause) to 409 with a reload message", async () => {
  for (const error of [Object.assign(new Error("zoning conflict"), { code: "LZ409" }), new Error("wrapped", { cause: { code: "LZ409" } })]) {
    const response = await patch(loadRoute(async () => { throw error; }).PATCH);
    assert.equal(response.status, 409);
    assert.match((response.body as { error: string }).error, /รีโหลด/);
  }
});

test("draft PATCH body cap (security) runs before the save, so oversized bodies never reach the 409 path", async () => {
  let saves = 0;
  const big = new Request("http://local/api/property-submissions/d", { method: "PATCH", body: JSON.stringify({ token: "t", description: "ก".repeat(30_000) }) });
  const response = await (loadRoute(async () => { saves++; }).PATCH as unknown as (r: unknown, c: unknown) => Promise<{ status: number }>)(big, { params: Promise.resolve({ id: "d" }) });
  assert.equal(response.status, 413);
  assert.equal(saves, 0);
});

test("draft PATCH keeps other database errors as 500", async () => {
  for (const error of [new Error("boom"), Object.assign(new Error("check"), { code: "23514" }), null]) {
    assert.equal((await patch(loadRoute(async () => { throw error; }).PATCH)).status, 500);
  }
});

test("savePropertyDraft leaves zoning untouched when omitted and writes it (even null) when present", async () => {
  const marketplace = read("src/lib/neon/marketplace.ts");
  const start = marketplace.indexOf("export async function savePropertyDraft(");
  const body = marketplace.slice(start, marketplace.indexOf("\nexport async function ", start + 10)).replace("export async function", "async function");
  const calls: { text: string; params: unknown[] }[] = [];
  const save = runInNewContext(`${compile(body)}; savePropertyDraft`, {
    getSql: () => ({ query: async (text: string, params: unknown[]) => { calls.push({ text, params }); return []; } }),
  }) as (id: string, token: string, input: Record<string, unknown>) => Promise<unknown>;
  await save("d", "t", { title: "x" });
  await save("d", "t", { zoning: null });
  await save("d", "t", { zoning: "green" });
  const flag = /zoning = case when \$(\d+)::boolean then \$21 else zoning end/.exec(calls[0].text);
  assert.ok(flag, "zoning assignment is conditional on a presence flag");
  const index = Number(flag[1]) - 1;
  assert.deepEqual(calls.map(call => [call.params[index], call.params[20]]), [[false, null], [true, null], [true, "green"]]);
});
