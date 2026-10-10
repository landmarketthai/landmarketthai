import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as zoning from "./zoning.ts";
import { isSameOriginMutation } from "./saved-searches.ts";

// Executes the real /api/admin/zoning/[id] PATCH handler; only session, DB write and revalidation are stubbed.
const id = "00000000-0000-4000-8000-0000000000aa";
const current = "2026-10-09T01:02:03.456789Z";
const zoningInfo = { zones: [{ color: "green", type_code: "", type_name: "" }], status: "owner_reported", plan_name: "", source: "", checked_at: "", evidence_url: "" };

function harness() {
  const state = { user: null as { id: string; email: string } | null, admin: false, writes: 0, revalidated: 0, fail: false };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init: { status?: number; headers: Record<string, string> }) => ({ body, status: init.status ?? 200, headers: init.headers }) } },
    "next/cache": { revalidatePath: () => { state.revalidated++; } },
    zod,
    "@/lib/auth/admin": { getSessionUser: async () => state.user, isAdminUserAllowed: () => state.admin },
    "@/lib/saved-searches": { isSameOriginMutation },
    "@/lib/zoning": zoning,
    "@/lib/neon/mutations": { updateLandZoning: async (_id: string, expected: string) => {
      state.writes++;
      if (state.fail) throw new Error("private SQL detail");
      return expected === current ? "101-rai-kabin-buri" : null;
    } },
  };
  const source = readFileSync(new URL("../app/api/admin/zoning/[id]/route.ts", import.meta.url), "utf8");
  const exports: { PATCH?: (request: unknown, context: unknown) => Promise<{ status: number; body: unknown; headers: Record<string, string> }> } = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  runInNewContext(compiled.outputText, { exports, console: { error() {} }, require: (name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`);
    return modules[name];
  } });
  const patch = (body: unknown, headers: Record<string, string> = { origin: "https://landmarketthai.com", host: "landmarketthai.com" }, routeId = id) =>
    exports.PATCH!({ headers: new Headers(headers), nextUrl: { origin: "https://landmarketthai.com" }, json: async () => body }, { params: Promise.resolve({ id: routeId }) });
  return { state, patch };
}

test("admin zoning PATCH: 401 without session, 403 non-admin and cross-origin, no DB write", async () => {
  const { state, patch } = harness();
  const body = { expected_updated_at: current, zoning_info: zoningInfo };
  assert.equal((await patch(body)).status, 401);
  state.user = { id: "u1", email: "someone@example.com" };
  assert.equal((await patch(body)).status, 403);
  state.admin = true;
  assert.equal((await patch(body, { origin: "https://evil.example", host: "landmarketthai.com" })).status, 403);
  assert.equal((await patch(body, { "sec-fetch-site": "cross-site", host: "landmarketthai.com" })).status, 403);
  assert.equal(state.writes, 0);
});

test("admin zoning PATCH: stale version 409, current version 200 + revalidate, bad input 400, DB error generic 500", async () => {
  const { state, patch } = harness();
  state.user = { id: "a1", email: "admin@example.com" };
  state.admin = true;
  const stale = await patch({ expected_updated_at: "2026-10-09T01:02:03.456788Z", zoning_info: zoningInfo });
  assert.equal(stale.status, 409);
  assert.equal(state.revalidated, 0);
  const ok = await patch({ expected_updated_at: current, zoning_info: zoningInfo });
  assert.equal(ok.status, 200);
  assert.equal(JSON.stringify(ok.body), JSON.stringify({ ok: true, slug: "101-rai-kabin-buri" }));
  assert.equal(state.revalidated, 1);
  assert.equal(ok.headers["Cache-Control"], "private, no-store");
  assert.equal((await patch({ expected_updated_at: current, zoning_info: zoningInfo }, undefined, "not-a-uuid")).status, 400);
  assert.equal((await patch({ expected_updated_at: current, zoning_info: zoningInfo, verification_status: "verified" })).status, 400);
  assert.equal((await patch({ expected_updated_at: current, zoning_info: { ...zoningInfo, status: "document_verified" } })).status, 400);
  state.fail = true;
  const failed = await patch({ expected_updated_at: current, zoning_info: zoningInfo });
  assert.equal(failed.status, 500);
  assert.doesNotMatch(JSON.stringify(failed.body), /private SQL/);
});
