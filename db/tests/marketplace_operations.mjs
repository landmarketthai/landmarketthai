// Disposable local PostgreSQL only, after partner fixture + both migrations.
// Execute the real pipeline queries through psql; no application credentials or network APIs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const exec = promisify(execFile);
const run = async sql => (await exec(process.env.PSQL_BIN || 'psql', [
  '-X', '-h', '127.0.0.1', '-p', process.env.PARTNER_TEST_PORT || '55439',
  '-U', 'partner_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
  '-A', '-F', '\t', '-P', 'footer=off', '-c', sql,
])).stdout.trim();
const literal = value => value == null ? 'null' : typeof value === 'string'
  ? `'${value.replaceAll("'", "''")}'` : String(value);
const sql = { async query(statement, params = []) {
  const output = await run(statement.replace(/\$(\d+)/g, (_, index) => literal(params[Number(index) - 1])));
  const [header, ...rows] = output.split(/\r?\n/);
  return rows.map(row => Object.fromEntries(header.split('\t').map((key, i) => {
    const value = row.split('\t')[i];
    return [key, value === '' ? null : value === 't' ? true : value === 'f' ? false
      : value?.startsWith('[') || value?.startsWith('{') ? JSON.parse(value) : value];
  })));
} };
const source = readFileSync(new URL('../../src/lib/operations/queries.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const queries = {};
runInNewContext(compiled.outputText, { exports: queries, require: name => {
  assert.equal(name, '@/lib/neon/server');
  return { getSql: () => sql };
} });

const buyer = randomUUID(), partnerLead = randomUUID(), land = randomUUID(), attribution = randomUUID();
await run(`insert into leads(id,lead_type,name,phone,details) values
  ('${buyer}','buyer','Pipeline buyer','0812345678','{"criteria":{"budget":100},"crm_log":null}'),
  ('${partnerLead}','partner','Pipeline partner','0812345678','{}');
  insert into lands(id,title_th,slug) values('${land}','Land fallback','pipeline-test');`);
const partner = (await sql.query(`select id, referral_code from operations_convert_partner('${partnerLead}','staff')`))[0];
await run(`update leads set referral_code='${partner.referral_code}' where id='${buyer}';
  insert into referral_attributions(id,lead_id,partner_id,referral_code,converted)
  values('${attribution}','${buyer}','${partner.id}','${partner.referral_code}',null);`);

assert.equal((await queries.createDeal({ buyer_lead_id: partnerLead, land_id: land })).kind, 'lead_not_found');
assert.equal((await queries.createDeal({ buyer_lead_id: randomUUID(), land_id: land })).kind, 'lead_not_found');
const created = await queries.createDeal({ buyer_lead_id: buyer, land_id: land });
assert.equal(created.kind, 'created');
assert.equal(created.attributionId, attribution);
assert.equal((await queries.createDeal({ buyer_lead_id: buyer, land_id: land })).kind, 'duplicate');
let deal = await queries.getDeal(created.id);
assert.equal(deal.listing_title, 'Land fallback');
assert.equal(deal.stage, 'qualified');
assert.equal(deal.status, 'in_progress');
const refOnly = await queries.createDeal({ buyer_lead_id: buyer, listing_ref: 'EXT-1', listing_title: 'External title' });
assert.equal(refOnly.kind, 'created');
assert.equal((await queries.getDeal(refOnly.id)).listing_title, 'External title');
assert.equal((await queries.createDeal({ buyer_lead_id: buyer, listing_ref: 'EXT-1' })).kind, 'duplicate');
assert.equal((await queries.createDeal({ buyer_lead_id: buyer, listing_title: 'Title only' })).kind, 'created');
assert.equal((await queries.createDeal({ buyer_lead_id: buyer, listing_title: 'title ONLY' })).kind, 'duplicate');

let lead = await queries.getLead(buyer);
assert.equal(await queries.updateLead(buyer, { expected_updated_at: lead.updated_at }, [{ type: 'note', at: new Date().toISOString(), by: 'staff', text: 'CRM note' }]), true);
lead = await queries.getLead(buyer);
assert.equal(lead.details.criteria.budget, 100);
assert.equal(lead.details.crm_log.length, 1);
assert.equal(lead.details.crm_log[0].text, 'CRM note');
assert.equal(lead.deals.find(item => item.id === created.id).listing_title, 'Land fallback');

const update = async (stage, status, closedAt, conversion) => {
  deal = await queries.getDeal(created.id);
  return queries.updateDeal(created.id, { expected_updated_at: deal.updated_at },
    { ok: true, stage, status, closedAt }, conversion,
    conversion === 'won' ? [{ type: 'status', at: new Date().toISOString(), by: 'staff', to: 'won' }] : []);
};
assert.equal((await update('won', 'closed', 'set', 'won')).updated, true);
deal = await queries.getDeal(created.id);
assert.equal(deal.status, 'closed'); assert.ok(deal.closed_at);
lead = await queries.getLead(buyer);
assert.equal(lead.status, 'won'); assert.equal(lead.details.criteria.budget, 100);
assert.equal(lead.details.crm_log.length, 2);
assert.equal(lead.referrals[0].converted, true);
const leadVersion = lead.updated_at;
await update('deposit', 'in_progress', 'clear', 'unwon');
deal = await queries.getDeal(created.id);
assert.equal(deal.status, 'in_progress'); assert.equal(deal.closed_at, null);
lead = await queries.getLead(buyer);
assert.equal(lead.referrals[0].converted, false); assert.equal(lead.updated_at, leadVersion);
await update('lost', 'cancelled', 'set', 'none');
deal = await queries.getDeal(created.id);
assert.equal(deal.status, 'cancelled'); assert.ok(deal.closed_at);
assert.equal((await queries.getLead(buyer)).updated_at, leadVersion);

// Winning a different property cannot steal an attribution linked to this deal.
const other = await queries.getDeal(refOnly.id);
await queries.updateDeal(refOnly.id, { expected_updated_at: other.updated_at },
  { ok: true, stage: 'won', status: 'closed', closedAt: 'set' }, 'won', []);
lead = await queries.getLead(buyer);
assert.equal(lead.referrals[0].deal_id, created.id);
assert.equal(lead.referrals[0].converted, false);
assert.equal((await queries.updateDeal(created.id, { expected_updated_at: '2000-01-01T00:00:00Z' },
  { ok: true, stage: 'won', status: 'closed', closedAt: 'set' }, 'won', [])).updated, false);

// Reruns with real rows must preserve contacts, CRM, attribution, payments, and events.
const snapshot = () => run(`select md5(jsonb_build_array(
  (select jsonb_agg(to_jsonb(l) order by id) from leads l),
  (select jsonb_agg(to_jsonb(p) order by id) from partners p),
  (select jsonb_agg(to_jsonb(d) order by id) from deals d),
  (select jsonb_agg(to_jsonb(a) order by id) from referral_attributions a),
  (select jsonb_agg(to_jsonb(e) order by id) from events e))::text)`);
const before = await snapshot();
await run("alter table deals alter column stage set default 'new'");
for (const migration of ['marketplace_operations_v1', 'partner_operations']) {
  await exec(process.env.PSQL_BIN || 'psql', ['-X', '-h', '127.0.0.1', '-p', process.env.PARTNER_TEST_PORT || '55439',
    '-U', 'partner_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f',
    fileURLToPath(new URL(`../migrations/20261003_${migration}.sql`, import.meta.url))]);
}
assert.equal(await snapshot(), before);
assert.match(await run("select column_default from information_schema.columns where table_name='deals' and column_name='stage'"), /qualified/);
console.log('Passed actual pipeline SQL: buyer guard, listing title/fallback, duplicates, CRM preservation, won/lost/reopen, attribution ownership, stale updates, and non-destructive migration reruns.');
