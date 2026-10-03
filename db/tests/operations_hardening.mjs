// Disposable schemas on local PostgreSQL only. No application credentials.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const binary = process.env.PSQL_BIN || 'psql';
const args = ['-X', '-h', '127.0.0.1', '-p', process.env.PARTNER_TEST_PORT || '55439', '-U', 'partner_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const marketplace = read('../migrations/20261003_marketplace_operations_v1.sql');
const partner = read('../migrations/20261003_partner_operations.sql');
const schema = `hardening_${randomUUID().replaceAll('-', '')}`;
const run = async sql => (await exec(binary, [...args, '-c', `set search_path to ${schema}; ${sql}`])).stdout.trim().replace(/^SET\r?\n/, '');
const migrate = sql => run(sql);
await run(`create schema ${schema}; ${read('./partner_operations_fixture.sql')}`);
try {
  await run("insert into deals(status) values('closed'),('cancelled'),('in_progress')");
  await migrate(marketplace);
  assert.equal(await run("select string_agg(stage,',' order by stage) from deals"), 'lost,qualified,won');
  await assert.rejects(run("insert into deals(stage,status) values(null,'in_progress')"));
  for (const [stage, status] of [['won','in_progress'], ['lost','closed'], ['qualified','cancelled'], ['deposit',null]]) {
    await assert.rejects(run(`insert into deals(stage,status) values('${stage}',${status ? `'${status}'` : 'null'})`));
  }
  await run("alter table deals drop constraint deals_stage_status_check; update deals set stage='deposit' where status='closed'");
  await assert.rejects(migrate(marketplace));
  assert.equal(await run("select stage from deals where status='closed'"), 'deposit');
  assert.equal(await run("select count(*) from pg_constraint where conrelid='deals'::regclass and conname='deals_stage_status_check'"), '0');
  await run("update deals set stage='won' where status='closed'");
  await migrate(marketplace);
  const legacy = randomUUID();
  await run(`insert into partners(id,name,phone,referral_code,total_paid) values('${legacy}','Legacy','0','legacy',50)`);
  await assert.rejects(migrate(partner));
  assert.equal(await run(`select total_paid from partners where id='${legacy}'`), '50.00');
  assert.equal(await run("select count(*) from information_schema.columns where table_schema=current_schema() and table_name='referral_attributions' and column_name='deal_id'"), '0');
  await run(`update partners set total_paid=0 where id='${legacy}';
    create function operations_deal_commission(uuid,numeric,numeric,boolean,text) returns deals language sql as 'select * from deals limit 1'`);
  await migrate(partner);
  assert.equal(await run("select to_regprocedure('operations_deal_commission(uuid,numeric,numeric,boolean,text)') is null"), 't');
  assert.equal(await run("select has_function_privilege('public','operations_deal_commission(uuid,numeric,numeric,boolean,text,timestamptz)','execute')"), 'f');
  const lead = randomUUID(), buyer = randomUUID(), code = `LMT-${lead.replaceAll('-', '').toUpperCase()}`;
  await run(`insert into leads(id,lead_type,name,phone) values('${lead}','partner','Partner','0'),('${buyer}','buyer','Buyer','0');
    insert into referral_attributions(lead_id,referral_code) values('${buyer}','${code}')`);
  const p = await run(`select id from operations_convert_partner('${lead}','staff')`);
  assert.equal(await run(`select partner_id from referral_attributions where referral_code='${code}'`), p);
  for (const status of ['won','lost']) {
    const closed = randomUUID();
    await run(`insert into leads(id,lead_type,name,phone,status) values('${closed}','partner','Closed','0','${status}'); update leads set status='${status}' where id='${lead}'`);
    await assert.rejects(run(`select operations_convert_partner('${closed}','staff')`), /Cannot convert a closed partner lead/);
    assert.equal(await run(`select id from operations_convert_partner('${lead}','staff')`), p);
    assert.equal(await run(`select status from leads where id='${lead}'`), status);
  }
  const d = randomUUID();
  await run(`insert into deals(id,partner_id,expected_commission,commission_paid) values('${d}','${p}',100,0)`);
  const version = await run(`select updated_at from deals where id='${d}'`);
  const pay = (amount, token = version) => run(`select id from operations_deal_commission('${d}',100,${amount},false,'staff','${token}'::timestamptz)`);
  const outcomes = await Promise.allSettled([pay(25), pay(35)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(r => r.status === 'rejected').reason.message, /Stale deal version/);
  const paid = await run(`select commission_paid from deals where id='${d}'`);
  await pay(paid); // A retry with the old token remains an audited no-op.
  assert.equal(await run(`select count(*) from events where entity_id='${d}'`), '1');
  assert.equal(await run(`select total_paid from partners where id='${p}'`), paid);
  await assert.rejects(pay(99, '2000-01-01T00:00:00Z'), /Stale deal version/);
  await assert.rejects(run(`select operations_deal_commission('${d}',100,99,false,'staff',null)`), /Stale deal version/);
  for (const column of ['listing_ref','listing_title']) {
    const insert = value => run(`insert into deals(buyer_lead_id,${column}) values('${buyer}','${value}')`);
    const race = await Promise.allSettled([insert('Race'),insert('rACE')]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  }
  // Distinct reference/title identities and land-backed rows may share text.
  await run(`insert into deals(buyer_lead_id,listing_ref,listing_title) values('${buyer}','OTHER','Race')`);
  const env = { ...process.env, PGOPTIONS: `-c search_path=${schema}`, PSQL_BIN: binary };
  await exec(binary, [...args, '-f', fileURLToPath(new URL('partner_operations.sql', import.meta.url))], { env });
  for (const path of ['partner_operations_concurrency.mjs','marketplace_operations.mjs']) await exec(process.execPath, [fileURLToPath(new URL(path, import.meta.url))], { env });
  console.log('Passed local hardening: atomic migration failures, stage/status, legacy totals, closed conversion, attribution backfill, stale-write race/retry, old signature removal, private execute, duplicate races, and existing SQL suites.');
} finally {
  await run(`drop schema ${schema} cascade`);
}
