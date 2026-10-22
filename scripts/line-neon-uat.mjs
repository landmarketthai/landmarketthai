// Existing disposable Neon branch ONLY. Credential enters via non-echoing stdin, never argv/files.
// Real Neon SQL and actual app/worker modules; LINE transport is always intercepted.
// No resources provisioned; deletes only this run's synthetic records. Leaves migrated schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import ts from 'typescript';
import * as delivery from '../src/lib/line/delivery.ts';

function validateTarget(value) {
  const url = new URL(value);
  assert.equal(url.protocol,'postgresql:');
  assert.ok(['ep-little-hall-az7hht8k.c-3.ap-southeast-1.aws.neon.tech','ep-little-hall-az7hht8k-cw5.c-3.ap-southeast-1.aws.neon.tech'].includes(url.hostname),'disposable branch endpoint required');
  assert.equal(decodeURIComponent(url.username),'landmarketthai_owner');
  assert.equal(url.pathname,'/landmarketthai');
  return value;
}
if (process.argv.includes('--self-check')) {
  assert.throws(()=>validateTarget('postgresql://landmarketthai_owner:x@production.neon.tech/landmarketthai'));
  assert.throws(()=>validateTarget('postgresql://wrong:x@ep-little-hall-az7hht8k.c-3.ap-southeast-1.aws.neon.tech/landmarketthai'));
  assert.doesNotThrow(()=>validateTarget('postgresql://landmarketthai_owner:x@ep-little-hall-az7hht8k.c-3.ap-southeast-1.aws.neon.tech/landmarketthai'));
  console.log('PASS branch, database and application-role guards');
  process.exit(0);
}
console.log('Waiting for disposable-branch connection URI on non-echoing stdin. No LINE sends.');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const connectionString = validateTarget(await new Promise((resolve,reject)=>{
  let value='';
  const timeout=setTimeout(()=>reject(new Error('credential_input_timeout')),60000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{
    value+=chunk;
    if(/[\r\n]/.test(value)) { clearTimeout(timeout); process.stdin.pause(); resolve(value.split(/[\r\n]/)[0].trim()); }
  });
}));
neonConfig.webSocketConstructor=WebSocket;
const pool=new Pool({connectionString,max:3,connectionTimeoutMillis:15000});
const sql=neon(connectionString);
const query=(statement,values=[])=>sql.query(statement,values);
const runId=`LINE-UAT-${randomUUID()}`;
const leadIds=[];
let requirementId, draftId, baseline, admin, step='connect';
const results=[];
const pass=name=>{results.push(name);console.log(`PASS ${name}`);};
function load(path,modules) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,Date,console:{error() {}},process:{env:{}},require(name){assert.ok(Object.hasOwn(modules,name),'unmocked dependency');return modules[name];}});
  return exports;
}
const snapshot=async()=>{
  const state={};
  for(const table of ['leads','buyer_requirements','property_submissions','lands','partners','referral_attributions']) {
    const [row]=await query(`select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) as fingerprint from public.${table} t`);
    state[table]=row;
  }
  return state;
};
try {
  admin=await pool.connect();
  await admin.query("select pg_advisory_lock(hashtext('native-line-isolated-uat'))");
  const [identity]=await query('select current_user as role,current_database() as database,version() as version');
  assert.equal(identity.role,'landmarketthai_owner');assert.equal(identity.database,'landmarketthai');
  baseline=await snapshot();
  const [existing]=await query("select to_regclass('public.line_notification_outbox') as table_name");
  if(existing.table_name)assert.equal((await query('select count(*)::int as count from line_notification_outbox'))[0].count,0,'outbox must be empty; never consume existing jobs');
  pass('isolated Neon identity and baseline captured');
  step='migration';
  const migration=readFileSync('neon/migrations/202610220001_line_notification_outbox.sql','utf8');
  await admin.query(migration);await admin.query(migration);
  assert.deepEqual(await snapshot(),baseline);
  for(const role of ['anonymous','authenticated']) {
    const [p]=await query("select has_table_privilege($1,'line_notification_outbox','SELECT') or has_table_privilege($1,'line_notification_outbox','INSERT') as exposed",[role]);
    assert.equal(p.exposed,false);
  }
  const [owner]=await query("select tableowner,rowsecurity from pg_tables where schemaname='public' and tablename='line_notification_outbox'");
  assert.equal(owner.tableowner,'landmarketthai_owner');assert.equal(owner.rowsecurity,true);
  pass('migration twice, owner role, RLS and browser grants');
  const modules={'@/lib/neon/server':{getSql:()=>({query})}};
  const mutations=load('../src/lib/neon/mutations.ts',modules);
  const marketplace=load('../src/lib/neon/marketplace.ts',{...modules,'@/lib/marketplace/buyer-demand-workflow':{},'@/lib/neon/queries':{},'@/lib/marketplace/matching':{findBuyerMatches:async()=>({full:[],near:[]})},'@/lib/marketplace/verification':{},'@/lib/marketplace/listing-workflow':{}});
  const lead=async type=>{
    const id=await mutations.insertLead({leadType:type,name:runId,phone:'0000000000',source:'/uat/native-line',consentPdpa:true,consentAt:new Date().toISOString()});
    leadIds.push(id);return id;
  };
  step='business_flows';
  for(const type of ['buyer','owner','partner'])await lead(type);
  const req=await marketplace.createBuyerRequirement({name:runId,phone:'0000000000',consent_pdpa:true,consent_public:false,province_ids:[],preferred_locations:[],property_type:'land',transaction_type:'sale'});
  requirementId=req.id;
  leadIds.push((await query('select lead_id from buyer_requirements where id=$1',[requirementId]))[0].lead_id);
  const [draft]=await query("insert into property_submissions(property_type,transaction_type,title,province_id,contact_name,contact_phone,total_rai,sale_price) select 'land','sale',$1,id,$1,'0000000000',3,1000000 from provinces limit 1 returning id,draft_token",[runId]);
  draftId=draft.id;
  assert.equal(await marketplace.submitPropertyDraft({id:draft.id,token:draft.draft_token,consentPdpa:true}),draft.id);
  leadIds.push((await query('select owner_lead_id from property_submissions where id=$1',[draftId]))[0].owner_lead_id);
  assert.equal(await marketplace.submitPropertyDraft({id:draft.id,token:draft.draft_token,consentPdpa:true}),null);
  assert.deepEqual((await query('select event_type from line_notification_outbox order by event_type')).map(r=>r.event_type),['buyer','buyer_requirement','owner','partner','seller_submission']);
  pass('five real app creation paths enqueue exactly once; seller resubmit denied');
  step='transaction_rollback';
  await assert.rejects(()=>marketplace.createBuyerRequirement({name:runId,phone:'0000000000',consent_pdpa:true,consent_public:false,province_ids:[],preferred_locations:[],property_type:'invalid',transaction_type:'sale'}));
  assert.equal((await query('select count(*)::int as count from leads where name=$1',[runId]))[0].count,5);
  await query('insert into line_notification_outbox(lead_id,event_type) select lead_id,event_type from line_notification_outbox on conflict(lead_id) do nothing');
  assert.equal((await query('select count(*)::int as count from line_notification_outbox'))[0].count,5);
  pass('failed business transaction leaves no orphan; unique lead constraint');
  let behavior=200,sends=0;
  const config={token:'synthetic-never-sent',groupId:`C${'a'.repeat(32)}`,siteUrl:'https://landmarketthai.test'};
  const outbox=load('../src/lib/line/outbox.ts',{...modules,'@/lib/line/delivery':{...delivery,lineConfig:()=>config,pushLine:(event,key)=>delivery.pushLine(event,key,config,async(_,init)=>{
    sends++;assert.equal(String(init.body).includes(runId),false);assert.equal(String(init.body).includes('0000000000'),false,'PII marker must not appear in message');
    if(behavior==='timeout')throw new DOMException('synthetic','TimeoutError');
    return new Response(null,{status:behavior,headers:{'x-line-request-id':'neon-uat-evidence','Retry-After':'120'}});
  })}});
  step='worker';await outbox.dispatchNotifications();await outbox.dispatchNotifications();
  assert.equal((await query("select count(*)::int as count from line_notification_outbox where status='sent' and line_request_id='neon-uat-evidence'"))[0].count,5);assert.equal(sends,5);
  pass('real Neon worker writes sent evidence; LINE transport mocked, privacy checked');
  for(const mode of ['timeout',429,400]) {
    const id=await lead('buyer');behavior=mode;await outbox.dispatchNotifications();
    const [job]=await query('select * from line_notification_outbox where lead_id=$1',[id]);
    assert.equal(job.status,mode===400?'failed':'retry');
    if(mode===429)assert.ok(Date.parse(job.available_at)-Date.parse(job.updated_at)>=120000);
    if(mode!==400){await query('update line_notification_outbox set available_at=now() where id=$1',[job.id]);behavior=200;await outbox.dispatchNotifications();const [done]=await query('select * from line_notification_outbox where id=$1',[job.id]);assert.equal(done.retry_key,job.retry_key);assert.equal(done.status,'sent');assert.equal(done.attempts,2);}
  }
  pass('timeout, 429 Retry-After, retry UUID reuse and permanent error on real Neon');
  step='concurrency';
  await lead('owner');
  const a=await pool.connect(), b=await pool.connect();
  let claimed;
  try {
    await a.query('begin');claimed=(await a.query(outbox.CLAIM_NOTIFICATION)).rows[0];assert.ok(claimed);
    assert.equal((await b.query(outbox.CLAIM_NOTIFICATION)).rows.length,0);await a.query('commit');
  } finally {await a.query('rollback');a.release();b.release();}
  await query("update line_notification_outbox set lease_until=now()-interval '1 second' where id=$1",[claimed.id]);
  const [recovered]=await query(outbox.CLAIM_NOTIFICATION);assert.equal(recovered.id,claimed.id);assert.notEqual(recovered.lease_token,claimed.lease_token);
  assert.equal((await query("update line_notification_outbox set last_error='stale' where id=$1 and lease_token=$2 returning id",[claimed.id,claimed.lease_token])).length,0);
  await query("update line_notification_outbox set lease_until=now()-interval '1 second' where id=$1",[claimed.id]);behavior=200;await outbox.dispatchNotifications();
  pass('two real Neon sessions exclude duplicate claims; lease recovery and stale-worker fencing');
  step='rollback_reapply';
  const rollback=readFileSync('scripts/line-notification-rollback.sql','utf8');
  const beforeRollback=await snapshot();
  await admin.query(rollback);await admin.query(rollback);assert.deepEqual(await snapshot(),beforeRollback);
  await admin.query(migration);assert.deepEqual(await snapshot(),beforeRollback);
  pass('rollback twice and migration reapply preserve CRM records');
} catch(error) {
  if(admin)await admin.query('rollback').catch(()=>{});
  console.error(JSON.stringify({result:'FAIL',step,code:error.code||error.name}));process.exitCode=1;
} finally {
  try {
    // Only exact IDs returned by this run are removed; no broad reset/truncate.
    if(draftId)await query('delete from property_submissions where id=$1',[draftId]);
    if(requirementId)await query('delete from buyer_requirements where id=$1',[requirementId]);
    if(leadIds.length)await query('delete from leads where id=any($1::uuid[]) and name=$2',[leadIds,runId]);
    if(baseline){assert.deepEqual(await snapshot(),baseline);pass('synthetic cleanup and exact original CRM fingerprints');}
  } catch(error){console.error(JSON.stringify({result:'FAIL',step:'cleanup',code:error.code||error.name}));process.exitCode=1;}
  if(admin){await admin.query("select pg_advisory_unlock(hashtext('native-line-isolated-uat'))");admin.release();}
  await pool.end();
}
console.log(JSON.stringify({result:process.exitCode?'FAIL':'PASS',branch:'br-bold-rain-azy4ax9e',role:'landmarketthai_owner',checks:results.length,baseline,realLineSends:0}));
