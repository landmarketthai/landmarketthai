// Disposable local PostgreSQL only. Real route handlers and application SQL; auth service is stubbed.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as nextServer from 'next/server.js';
import * as zod from 'zod';
import * as zoning from '../src/lib/zoning.ts';
import * as schemas from '../src/lib/marketplace/schemas.ts';
import * as workflow from '../src/lib/marketplace/listing-workflow.ts';
import * as buyerWorkflow from '../src/lib/marketplace/buyer-demand-workflow.ts';
import * as matching from '../src/lib/marketplace/matching.ts';
import * as verification from '../src/lib/marketplace/verification.ts';
import * as search from '../src/lib/marketplace/search-filters.ts';
import * as origins from '../src/lib/saved-searches.ts';
import { listingMetadata } from '../src/lib/public-seo.ts';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const database = process.env.ZONING_TEST_DATABASE;
assert.match(database ?? '', /^zoning_uat_[a-z0-9_]+$/);
const exec = promisify(execFile);
const psql = process.env.PSQL_BIN || 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}
assert.deepEqual(csv('a,b\n"O""Brien","line\n2"\n'), [['a','b'], ['O"Brien','line\n2']]);
const literal = value => value == null ? 'null' : Array.isArray(value)
  ? `ARRAY[${value.map(literal).join(',')}]` : typeof value === 'boolean' ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;
let queryCount = 0;
async function query(statement, params = []) {
  queryCount++;
  const bound = statement.replace(/\$(\d+)/g, (_, n) => literal(params[Number(n) - 1]));
  // SQL goes through stdin: Windows argv mangles Thai text.
  const running = exec(psql, ['-X', '-q', '--csv', '-P', 'footer=off', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-p', '55438', '-U', 'zoning_test', '-d', database, '-f', '-'],
    { env: { ...process.env, PGOPTIONS: '', PGSSLMODE: 'disable', PGCLIENTENCODING: 'UTF8', PGTZ: 'UTC' } });
  running.child.stdin.end(bound);
  const { stdout } = await running;
  const [fields, ...rows] = csv(stdout.trim());
  return rows.map(row => Object.fromEntries(fields.map((key, i) => {
    const v = row[i];
    return [key, v === '' ? null : v === 't' ? true : v === 'f' ? false : /^[\[{]/.test(v) ? JSON.parse(v) : v];
  })));
}
const sql = Object.assign((strings, ...params) => query(strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), params), { query });
function load(path, modules) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  runInNewContext(compiled.outputText, { exports, console, process: { env: { ADMIN_EMAILS: 'admin@example.test' } }, require: name => {
    assert.ok(Object.hasOwn(modules, name), `Unmocked dependency ${name}`); return modules[name];
  } });
  return exports;
}
const dbModule = { getSql: () => sql, getSqlIfConfigured: () => sql };
const marketplace = load('../src/lib/neon/marketplace.ts', {
  '@/lib/neon/server': dbModule, '@/lib/marketplace/buyer-demand-workflow': buyerWorkflow,
  '@/lib/neon/queries': {}, '@/lib/marketplace/matching': matching,
  '@/lib/marketplace/listing-workflow': workflow, '@/lib/marketplace/verification': verification,
});
const drafts = load('../src/app/api/property-submissions/[id]/route.ts', {
  'next/server': nextServer, '@/lib/marketplace/schemas': schemas, '@/lib/neon/marketplace': marketplace,
});
let session = null;
const auth = load('../src/lib/auth/admin.ts', { '@/lib/auth/server': { auth: { getSession: async () => ({ data: { user: session } }) } } });
const mutations = load('../src/lib/neon/mutations.ts', { '@/lib/neon/server': dbModule });
let invalidated = 0;
const admin = load('../src/app/api/admin/zoning/[id]/route.ts', {
  'next/server': nextServer, 'next/cache': { revalidatePath: () => invalidated++ }, zod,
  '@/lib/auth/admin': auth, '@/lib/saved-searches': origins, '@/lib/zoning': zoning, '@/lib/neon/mutations': mutations,
});
const badges = load('../src/components/listings/ZoningBadges.tsx', {
  'react/jsx-runtime': jsx, '@/lib/zoning': zoning, '@/lib/utils': await import('../src/lib/utils.ts'),
}).default;
const checks = [];
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
const province = (await query("insert into provinces(name_th,name_en,slug) values('ทดสอบ','Test','zoning-uat') returning id"))[0].id;
await query('insert into site_stats(id) values(1)');
const created = await marketplace.createPropertyDraft();
const context = { params: Promise.resolve({ id: created.id }) };
const info = zoning.ownerZoningSchema.parse({ zones: [{ color: 'green' }, { color: 'yellow', type_code: 'ย.1' }, { color: null }], status: 'owner_reported', source: "UAT O'Brien" });
const body = { token: created.token, property_type: 'land', title: 'UAT zoning', province_id: province, area_rai: 2,
  sale_price: 2000000, contact_name: 'UAT owner', contact_phone: '0812345678', zoning_info: info };
const patch = payload => ({ json: async () => payload });
assert.equal((await drafts.PATCH(patch(body), context)).status, 200);
const reload = await drafts.GET({ headers: new Headers({ 'x-draft-token': created.token }) }, context);
assert.deepEqual((await reload.json()).draft.zoning_info, info); pass('seller PATCH then GET reload retains multiple colors and partial fields');
assert.equal((await drafts.GET({ headers: new Headers() }, context)).status, 401);
assert.equal((await drafts.PATCH(patch({ ...body, token: crypto.randomUUID() }), context)).status, 404);
for (const status of ['map_checked', 'document_verified']) {
  assert.equal((await drafts.PATCH(patch({ ...body, zoning_info: { ...info, status, source: 'claim', checked_at: '2026-10-08', evidence_url: 'https://example.com/proof' } }), context)).status, 400);
}
pass('draft token is enforced and complete forged review statuses are rejected');
assert.ok(await marketplace.submitPropertyDraft({ id: created.id, token: created.token, consentPdpa: true }));
assert.equal((await drafts.PATCH(patch(body), context)).status, 404); pass('submitted draft cannot be edited with its public token');
assert.ok(await marketplace.reviewSubmission(created.id, 'approve'));
const landId = await marketplace.publishSubmission(created.id); assert.ok(landId);
let land = (await query('select * from lands where id=$1', [landId]))[0];
assert.deepEqual(land.zoning_info, info); assert.equal(land.zoning, 'green');
pass('existing approve/publish pipeline retains canonical zoning in lands');
for (const color of ['green','yellow']) {
  const params = []; const clauses = search.propertySearchSqlClauses({ zoning: color }, v => { params.push(v); return `$${params.length}`; });
  assert.ok((await query(`select l.id from lands l join provinces p on p.id=l.province_id where ${clauses.join(' and ')}`, params)).some(row => row.id === landId));
}
const html = renderToStaticMarkup(badges({ land, detail: true }));
const summary = zoning.zoningSummary(land);
assert.ok(html.includes(summary));
assert.equal(listingMetadata(land).description, zoning.listingMetadataDescription(land));
for (const meta of [listingMetadata(land).openGraph, listingMetadata(land).twitter]) assert.ok(meta.description.includes(summary));
assert.ok(html.includes('ยังไม่ทราบชื่อประเภท') && html.includes(zoning.ZONING_NOTICE));
pass('both SQL color filters, detail badges and description/OG/Twitter use persisted zoning');
const adminContext = { params: Promise.resolve({ id: landId }) };
const reviewed = { ...info, status: 'document_verified', source: 'UAT reviewed document', checked_at: '2026-10-08', evidence_url: 'https://example.com/proof.pdf' };
const version = value => value.replace(' ', 'T').replace(/\+00$/, 'Z');
const request = (expected = version(land.updated_at), origin = 'http://127.0.0.1:3100') => ({ nextUrl: new URL('http://127.0.0.1:3100/api/admin/zoning'), headers: new Headers({ origin }), json: async () => ({ zoning_info: reviewed, expected_updated_at: expected }) });
let calls = queryCount;
assert.equal((await admin.PATCH(request(), adminContext)).status, 401);
session = { id: crypto.randomUUID(), email: 'owner@example.test', emailVerified: true };
assert.equal((await admin.PATCH(request(), adminContext)).status, 403);
assert.equal(queryCount, calls); pass('unauthenticated and non-admin requests stop before database access');
session = { id: crypto.randomUUID(), email: 'admin@example.test', emailVerified: true };
assert.equal((await admin.PATCH(request(undefined, 'https://foreign.example'), adminContext)).status, 403);
assert.equal((await admin.PATCH(request('2000-01-01T00:00:00Z'), adminContext)).status, 409);
assert.equal((await admin.PATCH(request(), adminContext)).status, 200);
assert.equal(invalidated, 1);
land = (await query('select * from lands where id=$1', [landId]))[0];
assert.deepEqual(land.zoning_info, reviewed); assert.equal(land.verification_status, 'pending');
assert.deepEqual((await marketplace.getPropertyDraft(created.id, created.token)).zoning_info, reviewed);
pass('admin save/reload synchronizes linked submission, invalidates pages, rejects stale/cross-origin writes and resets generic Verified');
assert.ok(renderToStaticMarkup(badges({ land, detail: true })).includes('มีเอกสารยืนยัน'));
assert.ok(listingMetadata(land).description.includes('มีเอกสารยืนยัน')); pass('reviewed zoning stays consistent after reload across detail and metadata');
const detailHtml = row => renderToStaticMarkup(badges({ land: row, detail: true }));
const zoningDimension = row => verification.verificationDimensions({ ...row, price: null, title_deed_on_file: false }).find(d => d.key === 'zoning');
for (const [label, zoningInfo] of [['omitted', undefined], ['empty form default', zoning.zoningSchema.parse({})]]) {
  const draft = await marketplace.createPropertyDraft();
  const ctx = { params: Promise.resolve({ id: draft.id }) };
  const { zoning_info: _, ...withoutZoning } = body;
  const payload = { ...withoutZoning, token: draft.token, title: `UAT no zoning ${label}`, ...(zoningInfo && { zoning_info: zoningInfo }) };
  assert.equal((await drafts.PATCH(patch(payload), ctx)).status, 200, `draft without zoning (${label}) saves`);
  assert.ok(await marketplace.submitPropertyDraft({ id: draft.id, token: draft.token, consentPdpa: true }));
  assert.ok(await marketplace.reviewSubmission(draft.id, 'approve'));
  const id = await marketplace.publishSubmission(draft.id); assert.ok(id, `publish without zoning (${label}) succeeds`);
  const row = (await query('select * from lands where id=$1', [id]))[0];
  assert.equal(row.zoning, null);
  assert.equal(row.zoning_info?.status ?? null, zoningInfo ? 'unknown' : null, 'no owner_reported default');
  assert.equal(zoning.zoningSummary(row), 'ผังเมือง: ยังไม่ระบุผังเมือง');
  assert.ok(detailHtml(row).includes('ยังไม่ระบุผังเมือง') && !detailHtml(row).includes('ผู้ประกาศแจ้ง'));
  assert.ok(listingMetadata(row).description.includes('ยังไม่ระบุผังเมือง'));
}
pass('publish with zoning omitted or left empty succeeds and reloads as ยังไม่ระบุผังเมือง');
const legacy = (await query("select * from lands where slug='legacy-purple-verified'"))[0];
assert.equal(legacy.zoning_info, null); assert.equal(legacy.zoning, 'purple'); assert.equal(legacy.verification_status, 'verified');
assert.ok(detailHtml(legacy).includes('สีม่วง') && detailHtml(legacy).includes('ยังไม่ทราบ') && !detailHtml(legacy).includes('ผู้ประกาศแจ้ง'));
assert.notEqual(zoningDimension(legacy).state, 'ok');
pass('legacy Verified row without zoning_info stays untouched and reads ยังไม่ทราบ, never verified zoning');
const kabin = (await query("select * from lands where slug='101-rai-kabin-buri'"))[0];
assert.equal(kabin.zoning, 'green'); assert.equal(kabin.zoning_info.status, 'owner_reported'); assert.match(kabin.zoning_info.source, /พี่ไกร/);
assert.ok(detailHtml(kabin).includes('สีเขียว') && detailHtml(kabin).includes('ผู้ประกาศแจ้ง'));
assert.equal(kabin.verification_status, 'pending', 'documented effect: zoning change resets generic listing review');
pass('Kabin Buri 101 reads green + ผู้ประกาศแจ้ง after migration ran twice');
console.log(JSON.stringify({ database, checks: checks.length, passed: checks, limitation: 'Server session retrieval is stubbed; real Google OAuth/admin browser save still requires UAT with an authorized account.' }, null, 2));
