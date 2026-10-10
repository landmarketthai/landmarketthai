// LOCAL UAT ONLY: black-box HTTP checks against `next start` + a disposable Docker PostgreSQL.
// Never point this at Neon, Preview or Production. Requires `npm run build` first and:
//   docker container  UAT_PG_CONTAINER (default lmt-uat-pg18), database UAT_PG_DB (default e2e) with the full schema,
//   both release migrations and the two synthetic flagship rows; local-neon-http-proxy on 127.0.0.1:4444.
// Usage: node scripts/uat-local-e2e.mjs   (see docs/release/LANDMARKETTHAI_UAT_CLOSURE_20261010.md)
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = 3207;
const BASE = `http://127.0.0.1:${PORT}`;
const container = process.env.UAT_PG_CONTAINER || "lmt-uat-pg18";
const database = process.env.UAT_PG_DB || "e2e";
const eventLog = join(mkdtempSync(join(tmpdir(), "lmt-uat-")), "events.jsonl");
writeFileSync(eventLog, "");

const db = (sql) => execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", database, "-XAtc", sql], { encoding: "utf8" }).trim();
const events = (kind) => readFileSync(eventLog, "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((e) => !kind || e.kind === kind);
let ip = 10;
const call = async (path, { method = "GET", body, token, headers = {}, sameIp } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method, redirect: "manual",
    headers: {
      "x-real-ip": sameIp ?? `198.51.100.${ip++}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-turnstile-token": token } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, json, text, location: response.headers.get("location") };
};

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: {
    ...process.env,
    NODE_OPTIONS: `--import=${pathToFileURL("scripts/uat-local-preload.mjs").href}`,
    UAT_EVENT_LOG: eventLog,
    DATABASE_URL: `postgres://postgres:uat_local_only@db.localtest.me:4444/${database}`,
    NEON_AUTH_BASE_URL: "http://127.0.0.1:9/uat-no-auth",
    NEON_AUTH_COOKIE_SECRET: "uat-local-synthetic-cookie-secret-0123456789abcdef",
    ADMIN_EMAILS: "admin@uat.invalid",
    VERCEL_ENV: "preview",
    HUMAN_VERIFICATION_REQUIRED: "true",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    N8N_WEBHOOK_LEADS: "https://n8n-sink.invalid/uat",
    RATE_LIMIT_SECRET: "uat-local-rate-limit-secret",
    DO_SPACES_ENDPOINT: "https://sgp1.storage.invalid",
    DO_SPACES_BUCKET: "uat-fake-bucket",
    DO_SPACES_KEY: "fake-key",
    DO_SPACES_SECRET: "fake-secret",
    DO_SPACES_CDN_BASE: "https://cdn.storage.invalid",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (error) { results.push(["FAIL", name, error.message.split("\n")[0]]); }
};
const count = (table, where = "true") => Number(db(`select count(*) from ${table} where ${where}`));
const PII = ["0899990001", "0899990002", "0899990003", "0899990004", "0899990005"];
const FORBIDDEN_KEYS = /"(draft_token|contact_phone|contact_name|contact_email|phone|line_id|notes|admin_notes|commission[a-z_]*|referral_code|consent_pdpa|client_hash)"/;

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/robots.txt`)).ok) break; } catch {}
    if (i > 60) throw new Error(`server did not start:\n${serverLog}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  await check("public pages and SEO routes return 200; legacy /submit-land 308 to /sell", async () => {
    for (const path of ["/", "/land", "/search", "/sell", "/buy-request", "/become-partner", "/contact",
      "/property/101-rai-kabin-buri", "/property/37-rai-eec-rayong", "/sitemap.xml", "/robots.txt"]) {
      assert.equal((await call(path)).status, 200, path);
    }
    const legacy = await call("/submit-land");
    assert.equal(legacy.status, 308);
    assert.match(legacy.location, /\/sell$/);
    const sitemap = (await call("/sitemap.xml")).text;
    assert.match(sitemap, /101-rai-kabin-buri/);
  });

  await check("viewing /sell creates no draft", async () => {
    const before = count("property_submissions");
    await call("/sell"); await call("/sell");
    assert.equal(count("property_submissions"), before);
  });

  await check("lead without Turnstile token: 403, no row, no n8n", async () => {
    const before = count("leads");
    const r = await call("/api/leads", { method: "POST", body: { lead_type: "buyer", name: "UAT Tokenless", phone: "0899990009", consent_pdpa: true } });
    assert.equal(r.status, 403);
    assert.equal(count("leads"), before);
    assert.equal(events("n8n").length, 0);
  });

  const leadIds = [];
  await check("buyer / partner / owner leads with token: 200, row, one sanitised n8n event each", async () => {
    const bodies = [
      { lead_type: "buyer", name: "UAT Buyer", phone: PII[0], consent_pdpa: true, notes: "UAT synthetic" },
      { lead_type: "partner", name: "UAT Partner", phone: PII[1], consent_pdpa: true, working_area: "UAT" },
      { lead_type: "owner", name: "UAT Owner", phone: PII[2], consent_pdpa: true, province: "ระยอง", size_rai: 5,
        zoning_info: { zones: [{ color: "green", type_code: "", type_name: "" }], status: "owner_reported", plan_name: "", source: "", checked_at: "", evidence_url: "" } },
    ];
    for (const [i, body] of bodies.entries()) {
      const r = await call("/api/leads", { method: "POST", body, token: `uat-pass-lead-${i}` });
      assert.equal(r.status, 200, `${body.lead_type}: ${r.text}`);
      leadIds.push(r.json.id);
      assert.deepEqual(Object.keys(r.json).sort(), ["id", "ok"]);
    }
    const sink = events("n8n").map((e) => e.body);
    assert.deepEqual(sink.map((b) => b.lead_id), leadIds);
    for (const b of sink) assert.deepEqual(Object.keys(b).sort(), ["lead_id", "lead_type", "name"]);
    assert.equal(count("leads", `id in (${leadIds.map((id) => `'${id}'`).join(",")})`), 3);
  });

  await check("replayed (single-use) Turnstile token is rejected", async () => {
    const r = await call("/api/leads", { method: "POST", body: { lead_type: "buyer", name: "UAT Replay", phone: "0899990008", consent_pdpa: true }, token: "uat-pass-lead-0" });
    assert.equal(r.status, 403);
  });

  await check("buyer requirement: tokenless 403; with token 201, pending_review, matches carry no private fields", async () => {
    const body = { name: "UAT Requirement", phone: PII[3], consent_pdpa: true, property_type: "land", preferred_locations: ["ระยอง"] };
    assert.equal((await call("/api/buyer-requirements", { method: "POST", body })).status, 403);
    const r = await call("/api/buyer-requirements", { method: "POST", body, token: "uat-pass-req-1" });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.status, "pending_review");
    assert.ok(Array.isArray(r.json.matches.full) && Array.isArray(r.json.matches.near));
    assert.doesNotMatch(r.text, FORBIDDEN_KEYS);
    assert.equal(count("buyer_requirements", `phone = '${PII[3]}'`), 1);
  });

  let draft;
  await check("seller draft: tokenless/forged create 403 with no quota used; token creates exactly one", async () => {
    const before = count("property_submissions");
    assert.equal((await call("/api/property-submissions", { method: "POST" })).status, 403);
    assert.equal((await call("/api/property-submissions", { method: "POST", token: "forged" })).status, 403);
    assert.equal(count("public_write_rate_limits", "bucket = 'property_draft_create'"), 0);
    const r = await call("/api/property-submissions", { method: "POST", token: "uat-pass-draft-1" });
    assert.equal(r.status, 201, r.text);
    draft = r.json;
    assert.match(draft.id, /^[0-9a-f-]{36}$/);
    assert.match(draft.token, /^[0-9a-f-]{36}$/);
    assert.equal(count("property_submissions"), before + 1);
    // Non-degraded: the shared DB limiter recorded this call (client row + global row).
    assert.equal(count("public_write_rate_limits", "bucket = 'property_draft_create'"), 2);
  });

  await check("draft PATCH/GET are token-gated; save works with token", async () => {
    const path = `/api/property-submissions/${draft.id}`;
    assert.equal((await call(path)).status, 401);
    assert.equal((await call(path, { headers: { "x-draft-token": crypto.randomUUID() } })).status, 404);
    assert.equal((await call(path, { method: "PATCH", body: { title: "x" } })).status, 400);
    assert.equal((await call(path, { method: "PATCH", body: { token: crypto.randomUUID(), title: "x" } })).status, 404);
    const province = db("select id from provinces where name_th = 'ระยอง'");
    const r = await call(path, { method: "PATCH", body: {
      token: draft.token, property_type: "land", transaction_type: "sale", title: "UAT synthetic draft", province_id: province,
      area_rai: 3, sale_price: 1000000, contact_name: "UAT Seller", contact_phone: PII[4], lat: 12.7, lng: 101.2,
      zoning_info: { zones: [{ color: "green", type_code: "", type_name: "" }], status: "owner_reported", plan_name: "", source: "", checked_at: "", evidence_url: "" },
    } });
    assert.equal(r.status, 200, r.text);
    const got = await call(path, { headers: { "x-draft-token": draft.token } });
    assert.equal(got.status, 200);
    assert.equal(got.json.draft.title, "UAT synthetic draft");
  });

  await check("seller cannot claim map_checked / document_verified zoning", async () => {
    const r = await call(`/api/property-submissions/${draft.id}`, { method: "PATCH", body: { token: draft.token,
      zoning_info: { zones: [{ color: "purple", type_code: "", type_name: "" }], status: "document_verified", plan_name: "x", source: "x", checked_at: "2026-10-01", evidence_url: "https://example.com/x.pdf" } } });
    assert.equal(r.status, 400);
    assert.equal(db(`select zoning_info->>'status' from property_submissions where id = '${draft.id}'`), "owner_reported");
  });

  await check("upload presign: token-gated, key under draft prefix, extension from MIME, fake endpoint only; confirm without object = 409, no media row", async () => {
    const path = `/api/property-submissions/${draft.id}/uploads`;
    const file = { media_kind: "image", file_name: "a./../../evil.html", mime_type: "image/png", size_bytes: 1000 };
    assert.equal((await call(`${path}/presign`, { method: "POST", body: { ...file, token: crypto.randomUUID() } })).status, 404);
    assert.equal((await call(`${path}/presign`, { method: "POST", body: { ...file, mime_type: "application/pdf", token: draft.token } })).status, 400);
    const r = await call(`${path}/presign`, { method: "POST", body: { ...file, token: draft.token } });
    assert.equal(r.status, 200, r.text);
    assert.match(r.json.storage_key, new RegExp(`^submissions/${draft.id}/images/[0-9a-f-]{36}\\.png$`));
    assert.ok(new URL(r.json.upload_url).hostname.endsWith(".invalid"));
    const c = await call(`${path}/confirm`, { method: "POST", body: { ...file, token: draft.token, storage_key: r.json.storage_key } });
    assert.equal(c.status, 409, c.text);
    const other = await call(`${path}/confirm`, { method: "POST", body: { ...file, token: draft.token, storage_key: `submissions/${crypto.randomUUID()}/images/x.png` } });
    assert.equal(other.status, 400);
    assert.equal(count("property_submission_media"), 0);
  });

  await check("draft submit: tokenless 403; with token 200; resubmit and later PATCH refused", async () => {
    const path = `/api/property-submissions/${draft.id}/submit`;
    assert.equal((await call(path, { method: "POST", body: { token: draft.token, consent_pdpa: true } })).status, 403);
    const r = await call(path, { method: "POST", body: { token: draft.token, consent_pdpa: true }, token: "uat-pass-submit-1" });
    assert.equal(r.status, 200, r.text);
    assert.notEqual(db(`select status from property_submissions where id = '${draft.id}'`), "draft");
    const again = await call(path, { method: "POST", body: { token: draft.token, consent_pdpa: true }, token: "uat-pass-submit-2" });
    assert.ok([404, 409].includes(again.status), String(again.status));
    assert.equal((await call(`/api/property-submissions/${draft.id}`, { method: "PATCH", body: { token: draft.token, title: "late" } })).status, 404);
  });

  await check("draft create per-IP limit: 10 verified creates then 429 Retry-After; other IP unaffected", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await call("/api/property-submissions", { method: "POST", token: `uat-pass-burst-${i}`, sameIp: "203.0.113.77" })).status);
    assert.deepEqual(statuses, [...Array(10).fill(201), 429]);
    assert.equal((await call("/api/property-submissions", { method: "POST", token: "uat-pass-burst-other" })).status, 201);
  });

  await check("admin APIs and pages without session: 401 / redirect to /login; forged cookie rejected", async () => {
    assert.equal((await call("/api/admin/leads")).status, 401);
    assert.equal((await call("/api/admin/property-submissions")).status, 401);
    const kabin = db("select id from lands where slug = '101-rai-kabin-buri'");
    assert.equal((await call(`/api/admin/zoning/${kabin}`, { method: "PATCH", body: {} })).status, 401);
    const forged = await call("/api/admin/leads", { headers: { cookie: "__Secure-neon-auth.session_token=forged; neon-auth.session_token=forged" } });
    assert.equal(forged.status, 401);
    const page = await call("/admin");
    assert.equal(page.status, 307);
    assert.match(page.location, /\/login/);
  });

  await check("open redirect: /auth/callback with hostile next goes to /", async () => {
    for (const next of ["%2F%5Cevil.example", "%2F%2Fevil.example", "https%3A%2F%2Fevil.example"]) {
      const r = await call(`/auth/callback?next=${next}`);
      const to = new URL(r.location, BASE);
      assert.ok(["127.0.0.1", "localhost"].includes(to.hostname) && to.pathname === "/" && !/evil/.test(r.location), r.location);
    }
  });

  await check("public pages / search API / sitemap leak no lead, seller or draft data", async () => {
    const pages = ["/", "/land", "/search", "/property/101-rai-kabin-buri", "/property/37-rai-eec-rayong", "/buyer-demand", "/sitemap.xml"];
    const search = await call("/api/properties/search");
    for (const text of [...await Promise.all(pages.map(async (p) => (await call(p)).text)), search.text]) {
      for (const value of [...PII, draft.token, "UAT Seller", "UAT synthetic draft", "UAT Requirement"]) assert.equal(text.includes(value), false, value);
    }
    assert.doesNotMatch(search.text, FORBIDDEN_KEYS);
  });

  await check("no unexpected egress; n8n sink got exactly the 3 lead events; Siteverify only via fake", async () => {
    assert.deepEqual(events("blocked_egress"), []);
    assert.equal(events("n8n").length, 3);
    assert.ok(events("siteverify").length >= 10);
  });
} finally {
  server.kill();
}

for (const [status, name, detail] of results) console.log(`${status}  ${name}${detail ? `  -- ${detail}` : ""}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (/Error|error/.test(serverLog) && process.env.UAT_SHOW_SERVER_LOG) console.log(serverLog);
process.exit(failed ? 1 : 0);
