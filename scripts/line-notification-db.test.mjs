// Disposable LOCAL Docker PostgreSQL 18 only. No network credentials or real LINE calls.
// Starts with a NEW database; leaves it for HTTP UAT. Requires container lmt-line-pg18-20261022.
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as delivery from "../src/lib/line/delivery.ts";

const container = process.env.UAT_PG_CONTAINER || "lmt-line-pg18-20261022";
assert.match(container, /^lmt-line-pg18-[a-z0-9-]+$/);
const database = `line_${Date.now()}`;
const psqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1"];
const raw = sql => execFileSync("docker", psqlArgs, { input: `set client_min_messages=warning;\n${sql}`, encoding: "utf8", maxBuffer: 5_000_000 }).trim();
const literal = value => value === null ? "NULL" : Array.isArray(value) ? (value.length ? `ARRAY[${value.map(literal).join(',')}]` : "'{}'") : typeof value === "number" ? String(value) : typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const parameterize = (sql, values = []) => sql.replace(/\$(\d+)/g, (_, n) => literal(values[Number(n)-1]));
const returning = sql => {
  if (/^\s*with/i.test(sql)) {
    const end = [...sql.matchAll(/\)\s*(select|update)\b/gi)].at(-1);
    assert.ok(end, 'known business CTE has a final select/update');
    const prefix = sql.slice(0,end.index+1), statement=sql.slice(end.index+1);
    return `${prefix}, r as (${statement}) select coalesce(json_agg(r),'[]') from r`;
  }
  return /^\s*select/i.test(sql) ? `select coalesce(json_agg(r),'[]') from (${sql}) r` : `with r as (${sql}) select coalesce(json_agg(r),'[]') from r`;
};
const query = async (sql, values = []) => {
  const statement = parameterize(sql, values);
  if (!/^\s*(select|with)/i.test(sql) && !/\breturning\b/i.test(sql)) { raw(statement); return []; }
  return JSON.parse(raw(returning(statement)));
};
function load(path, modules) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, console, process: { env: {} }, require(name) {
    assert.ok(Object.hasOwn(modules,name), `Unmocked dependency: ${name}`); return modules[name];
  } });
  return exports;
}
execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database]);
raw(`create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select from pg_roles where rolname='anonymous') then create role anonymous; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;`);
raw(readFileSync("supabase/schema.sql", "utf8"));
for (const dir of ["supabase/migrations", "db/migrations"]) {
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) raw(readFileSync(`${dir}/${file}`, "utf8"));
}
raw(readFileSync("neon/migrations/202610080001_zoning_info.sql", "utf8"));
const migration = readFileSync("neon/migrations/202610220001_line_notification_outbox.sql", "utf8");
raw(migration); raw(migration);
assert.equal(raw("select count(*) from line_notification_outbox"), "0", "no historical backfill");
const dbModules = { "@/lib/neon/server": { getSql: () => ({ query }) } };
const mutations = load("../src/lib/neon/mutations.ts", dbModules);
const marketplace = load("../src/lib/neon/marketplace.ts", { ...dbModules,
  "@/lib/marketplace/buyer-demand-workflow": {}, "@/lib/neon/queries": {},
  "@/lib/marketplace/matching": { findBuyerMatches: async () => ({ full: [], near: [] }) },
  "@/lib/marketplace/verification": {}, "@/lib/marketplace/listing-workflow": {},
});
const lead = type => mutations.insertLead({ leadType: type, name: "PRIVATE synthetic", phone: "0899990001", consentPdpa: true, consentAt: new Date().toISOString() });
for (const type of ["buyer", "owner", "partner"]) await lead(type);
await marketplace.createBuyerRequirement({ name: "PRIVATE buyer", phone: "0899990002", consent_pdpa: true,
  consent_public: false, province_ids: [], preferred_locations: ["ระยอง"], transaction_type: "sale", property_type: "land" });
const [draft] = await query(`insert into property_submissions (property_type,transaction_type,title,province_id,contact_name,contact_phone,total_rai,sale_price)
  select 'land','sale','PRIVATE seller',id,'PRIVATE','0899990003',3,1000000 from provinces limit 1 returning id,draft_token`);
assert.equal(await marketplace.submitPropertyDraft({ id: draft.id, token: draft.draft_token, consentPdpa: true }), draft.id);
assert.equal(await marketplace.submitPropertyDraft({ id: draft.id, token: draft.draft_token, consentPdpa: true }), null);
assert.deepEqual(JSON.parse(raw("select json_agg(event_type order by event_type) from line_notification_outbox")), ["buyer","buyer_requirement","owner","partner","seller_submission"]);
assert.equal(raw("select count(*) from leads"), "5");
console.log("PASS real business SQL: buyer, owner, partner, requirement, seller; repeated seller submit creates no duplicate");

const originalIds = JSON.parse(raw("select json_agg(id) from leads"));
const originalRows = `select md5(string_agg(to_jsonb(l)::text,',' order by id)) from leads l where id in (${originalIds.map(literal).join(',')})`;
const fingerprint = raw(originalRows);
raw(`begin; insert into leads(lead_type,name,phone,consent_pdpa,consent_at) values ('buyer','rollback','000',true,now()); rollback;`);
assert.equal(raw("select count(*) from line_notification_outbox"), "5");
raw("insert into line_notification_outbox(lead_id,event_type) select lead_id,event_type from line_notification_outbox on conflict(lead_id) do nothing");
assert.equal(raw("select count(*) from line_notification_outbox"), "5");
for (const role of ["anon","anonymous","authenticated"]) assert.equal(raw(`select has_table_privilege('${role}','line_notification_outbox','SELECT') or has_table_privilege('${role}','line_notification_outbox','INSERT')`), "f");
console.log("PASS rollback, duplicate constraint, browser roles denied");

const requirementCount = raw('select count(*) from buyer_requirements');
await assert.rejects(() => marketplace.createBuyerRequirement({ name:'PRIVATE rejected',phone:'000',consent_pdpa:true,
  consent_public:false,province_ids:[],preferred_locations:[],transaction_type:'sale',property_type:'invalid' }));
assert.equal(raw('select count(*) from leads'),'5');
assert.equal(raw('select count(*) from line_notification_outbox'),'5');
assert.equal(raw('select count(*) from buyer_requirements'),requirementCount);
console.log('PASS failed requirement statement rolls back its lead and notification together');

const config = { token: "synthetic", groupId: `C${"0".repeat(32)}`, siteUrl: "https://landmarketthai.test" };
let behavior = 200;
const requests = [];
const outbox = load("../src/lib/line/outbox.ts", { ...dbModules, "@/lib/line/delivery": { ...delivery,
  lineConfig: () => config, pushLine: (event, key) => delivery.pushLine(event, key, config, async (_, init) => {
    requests.push(JSON.parse(init.body));
    if (behavior === "timeout") throw new DOMException("synthetic timeout", "TimeoutError");
    return new Response(null, { status: behavior, headers: { "x-line-request-id": "synthetic-evidence", "Retry-After": "120" } });
  }),
} });
await outbox.dispatchNotifications(); await outbox.dispatchNotifications();
assert.equal(raw("select count(*) from line_notification_outbox where status='sent' and sent_at is not null and line_request_id='synthetic-evidence'"), "5");
assert.equal(requests.length,5);
assert.equal(JSON.stringify(requests).includes("PRIVATE"),false);
assert.equal(JSON.stringify(requests).includes("089999000"),false);
console.log("PASS native worker -> mocked LINE -> persisted sent evidence; no PII");

for (const [scenario, status] of [["timeout","retry"],[429,"retry"],[400,"failed"]]) {
  const id = await lead("buyer"); behavior = scenario;
  await outbox.dispatchNotifications();
  const [job] = await query("select * from line_notification_outbox where lead_id=$1",[id]);
  assert.equal(job.status,status);
  assert.equal(job.attempts,1);
  if (scenario===429) assert.ok(Date.parse(job.available_at)-Date.parse(job.updated_at)>=120000);
  if(status==='retry') {
    behavior=200;raw(`update line_notification_outbox set available_at=now() where lead_id=${literal(id)}`);
    await outbox.dispatchNotifications();
    const [retried] = await query("select * from line_notification_outbox where lead_id=$1",[id]);
    assert.equal(retried.retry_key,job.retry_key);assert.equal(retried.status,'sent');assert.equal(retried.attempts,2);
  }
}
console.log("PASS timeout retry, 429 Retry-After, permanent failure, persisted retry-key reuse without n8n");

const concurrentId=await lead('owner');
const claimSql=returning(outbox.CLAIM_NOTIFICATION);
const run=promisify(execFile);
const claim=() => run('docker',[...psqlArgs,'-c',`begin; ${claimSql}; select pg_sleep(0.5); commit;`],{encoding:'utf8'}).then(r=>JSON.parse(r.stdout.trim()));
const pair=await Promise.all([claim(),claim()]);
assert.deepEqual(pair.map(x=>x.length).sort(),[0,1]);
const original=pair.flat()[0];assert.equal(original.lead_id,concurrentId);
raw(`update line_notification_outbox set lease_until=now()-interval '1 second' where lead_id=${literal(concurrentId)}`);
const recovered=await query(outbox.CLAIM_NOTIFICATION);
assert.equal(recovered[0].id,original.id);assert.notEqual(recovered[0].lease_token,original.lease_token);assert.equal(recovered[0].attempts,2);
const fenced=await query("update line_notification_outbox set last_error='stale' where id=$1 and lease_token=$2 returning id",[original.id,original.lease_token]);
assert.equal(fenced.length,0);
raw(`update line_notification_outbox set lease_until=now()-interval '1 second' where id=${literal(original.id)}`);
behavior=200;await outbox.dispatchNotifications();
console.log("PASS concurrent SKIP LOCKED claim, interrupted lease recovery and stale-worker fencing");

for(const reason of ['attempts','window','pending_age']) {
 const id=await lead('buyer');
 raw(`update line_notification_outbox set ${reason==='attempts'?'attempts=8':reason==='window'?"first_attempt_at=now()-interval '24 hours'":"created_at=now()-interval '8 days'"} where lead_id=${literal(id)}`);
 await outbox.dispatchNotifications();
 assert.equal(raw(`select status from line_notification_outbox where lead_id=${literal(id)}`),'failed');
}
const sentOld=await lead('buyer'),failedOld=await lead('buyer');
raw(`update line_notification_outbox set status='sent',updated_at=now()-interval '31 days' where lead_id=${literal(sentOld)};
 update line_notification_outbox set status='failed',updated_at=now()-interval '91 days' where lead_id=${literal(failedOld)};`);
await outbox.dispatchNotifications();
assert.equal(raw(`select count(*) from line_notification_outbox where lead_id in (${literal(sentOld)},${literal(failedOld)})`),'0');
console.log("PASS retry ceiling, deduplication-window expiry, stale pending expiry, terminal retention");

const rollback=readFileSync('scripts/line-notification-rollback.sql','utf8');raw(rollback);raw(rollback);
assert.equal(raw(originalRows),fingerprint);
raw(migration);
console.log('PASS migration twice, rollback twice, reapply, original CRM rows unchanged');
// Fresh HTTP UAT database retains full schema but only two synthetic public listings.
raw(`truncate leads cascade;
 insert into lands(title_th,slug,province_id,land_type,status,verification_status,zoning,size_rai,total_price)
 select v.title,v.slug,p.id,'land','active','verified',v.zone::zoning_enum,v.rai,1000000
 from (values ('ที่ดิน 101 ไร่ กบินทร์บุรี','101-rai-kabin-buri',null,101),('ที่ดิน 37 ไร่ EEC ระยอง','37-rai-eec-rayong','purple',37)) v(title,slug,zone,rai)
 cross join (select id from provinces limit 1) p;`);
console.log(`UAT_PG_DB=${database}`);
