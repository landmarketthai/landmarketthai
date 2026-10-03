// Local PostgreSQL only. Run after fixture + migration; uses the installed psql CLI, no npm dependencies.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const binary = process.env.PSQL_BIN || 'psql';
const port = process.env.PARTNER_TEST_PORT || '55439';
const run = async sql => (await exec(binary, ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'partner_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql])).stdout.trim();
const lead = randomUUID(), buyer = randomUUID(), d1 = randomUUID(), d2 = randomUUID();
await run(`insert into leads(id,lead_type,name,phone) values('${lead}','partner','Concurrent partner','0812345678'),('${buyer}','buyer','Buyer','0812345678')`);
await Promise.all([
  run(`begin; select id from operations_convert_partner('${lead}','staff-a'); select pg_sleep(0.2); commit`),
  run(`select id from operations_convert_partner('${lead}','staff-b')`),
]);
assert.equal(await run(`select count(*) from partners where lead_id='${lead}'`), '1');
const partner = await run(`select id from partners where lead_id='${lead}'`);
assert.equal(await run(`select count(*) from events where entity_id='${partner}' and event_type='partner_converted'`), '1');
await run(`insert into deals(id,partner_id,stage,status,expected_commission,commission_paid) values('${d1}','${partner}','won','closed',100,0),('${d2}','${partner}','qualified','in_progress',200,0)`);
await Promise.all([
  run(`begin; select id from operations_deal_commission('${d1}',100,25,false,'staff-a',(select updated_at from deals where id = '${d1}')); select pg_sleep(0.2); commit`),
  run(`select id from operations_deal_commission('${d2}',200,35,false,'staff-b',(select updated_at from deals where id = '${d2}'))`),
]);
assert.equal(await run(`select total_paid from partners where id='${partner}'`), '60.00');
await Promise.all([run(`select id from operations_deal_commission('${d1}',100,25,false,'staff-a',(select updated_at from deals where id = '${d1}'))`), run(`select id from operations_deal_commission('${d1}',100,25,false,'staff-b',(select updated_at from deals where id = '${d1}'))`)]);
assert.equal(await run(`select count(*) from events where entity_id='${d1}' and event_type='deal_commission_changed'`), '1');

// Check the exact production list query, including two attributions with the same lead (no fanout).
await run(`insert into referral_attributions(referral_code,lead_id,partner_id,entity_type,converted,deal_id)
  select referral_code,'${buyer}',id,'buyer',true,'${d1}' from partners where id='${partner}';
  insert into referral_attributions(referral_code,lead_id,partner_id,entity_type,converted)
  select referral_code,'${buyer}',id,'buyer',false from partners where id='${partner}'`);
const source = readFileSync(new URL('../../src/lib/partners/server.ts', import.meta.url), 'utf8');
const query = source.match(/getSql\(\)\.query\(`([\s\S]*?)`\)/)[1];
const rows = JSON.parse(await run(`select coalesce(json_agg(q),'[]') from (${query}) q`));
const row = rows.find(row => row.id === partner);
assert.equal(row.lead_count, 1); assert.equal(row.converted_count, 1);
assert.equal(row.open_count, 1); assert.equal(row.won_count, 1);
assert.equal(row.expected, '300.00'); assert.equal(row.paid, '60.00');
assert.equal(row.payable, '75.00'); assert.equal(row.projected, '200.00');
assert.equal(await run(`select operations_partner_code('${lead}')`), `LMT-${lead.replaceAll('-', '').toUpperCase()}`);
console.log('Passed concurrent conversion, concurrent payments, retries, code parity, and production summary query.');
