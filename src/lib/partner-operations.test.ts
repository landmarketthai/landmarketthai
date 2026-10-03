import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { referralCode, validateCommission, commissionSummary } from './partners/helpers.ts';

const expected_updated_at = '2026-10-03T00:00:00.123456Z';
test('commission requires an ISO version and preserves PostgreSQL microseconds', () => {
  for (const version of [undefined, null, '', 'yesterday', 123]) {
    assert.throws(() => validateCommission({ expected_updated_at: version, expected_commission: null, commission_paid: '0' }));
  }
  assert.equal(validateCommission({ expected_updated_at, expected_commission: null, commission_paid: '0' }).expected_updated_at, expected_updated_at);
});
test('partner migration closes stale bypass, protects closed leads and reconciles legacy totals', () => {
  const sql = readFileSync(new URL('../../db/migrations/20261003_partner_operations.sql', import.meta.url), 'utf8');
  assert.match(sql, /if found then return p; end if;\s+if l.status::text in \('won','lost'\)/);
  assert.match(sql, /update referral_attributions set partner_id = p.id\s+where referral_code = p.referral_code and partner_id is null/);
  assert.match(sql, /p.total_paid is distinct from[\s\S]*sum\(d.commission_paid\)/);
  assert.ok(sql.indexOf('Partner total_paid differs') < sql.indexOf('update partners p set total_paid'));
  assert.match(sql, /drop function if exists operations_deal_commission\(uuid,numeric,numeric,boolean,text\)/);
  assert.match(sql, /p_expected_updated_at timestamptz/);
  assert.match(sql, /for update;[\s\S]*return d; end if;[\s\S]*d.updated_at is distinct from p_expected_updated_at[\s\S]*errcode = '40001'/);
  assert.match(sql, /revoke all on function operations_deal_commission\(uuid,numeric,numeric,boolean,text,timestamptz\) from public/);
  const server = readFileSync(new URL('./partners/server.ts', import.meta.url), 'utf8');
  assert.match(server, /to_char\(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'\)/);
  assert.match(server, /\$6::timestamptz/);
  assert.match(server, /actorId, input.expected_updated_at/);
  const form = readFileSync(new URL('../app/admin/partners/Controls.tsx', import.meta.url), 'utf8');
  assert.match(form, /expected_updated_at: deal.updated_at/);
});
const lead = '00000000-0000-4000-8000-000000000001';
test('referral codes are deterministic, UUID scoped, case insensitive, with collision candidates', () => {
  assert.equal(referralCode(lead), 'LMT-00000000000040008000000000000001');
  assert.equal(referralCode(lead, 1), `${referralCode(lead)}-1`);
  assert.equal(referralCode(lead.toUpperCase()), referralCode(lead));
  assert.notEqual(referralCode(lead), referralCode(lead.replace(/1$/, '2')));
  for (const attempt of [-1, 0.5, Infinity]) assert.throws(() => referralCode(lead, attempt));
  assert.throws(() => referralCode('not-an-id'));
});
test('commission amounts preserve cents and require an explicit boolean override', () => {
  assert.deepEqual(validateCommission({ expected_updated_at, expected_commission: '100', commission_paid: '20.1' }),
    { expected_updated_at, expected_commission: '100.00', commission_paid: '20.10', override: false });
  assert.equal(validateCommission({ expected_updated_at, expected_commission: null, commission_paid: '9999999999999999.99' }).commission_paid, '9999999999999999.99');
  assert.equal(validateCommission({ expected_updated_at, expected_commission: '0', commission_paid: '1', override: true }).override, true);
  for (const value of ['-1', 'NaN', 'Infinity', '1.001', '10000000000000000', '', 1, null]) {
    assert.throws(() => validateCommission({ expected_updated_at, expected_commission: '10', commission_paid: value }));
    assert.throws(() => validateCommission({ expected_updated_at, expected_commission: value === null ? undefined : value, commission_paid: '0' }));
  }
  for (const override of [undefined, false, 'true', 1]) assert.throws(() => validateCommission({ expected_updated_at, expected_commission: '1', commission_paid: '2', override }));
  assert.throws(() => validateCommission({ expected_updated_at, expected_commission: '1', commission_paid: '0', role: 'admin' }));
});
test('summaries recalculate cumulative payments, with won payable and open projected', () => {
  const deals = [
    { stage: 'won', status: 'closed', expected_commission: '100.10', commission_paid: '20.10' },
    { stage: 'negotiation', status: 'in_progress', expected_commission: '50.20', commission_paid: '0.10' },
    { stage: 'lost', status: 'cancelled', expected_commission: '30.00', commission_paid: '1.00' },
    { stage: 'won', status: 'in_progress', expected_commission: null, commission_paid: '2.00' },
  ];
  const summary = { expected: '180.30', paid: '23.20', payable: '80.00', projected: '50.20' };
  assert.deepEqual(commissionSummary(deals), summary);
  assert.deepEqual(commissionSummary(deals), summary);
  deals[0].commission_paid = '101.10';
  assert.equal(commissionSummary(deals).paid, '104.20');
  assert.equal(commissionSummary(deals).payable, '0.00');
});

// Run the real route handlers with a session boundary and DB stub; no auth/DB network calls.
const state = { user: null as null | { id: string; role?: string }, calls: [] as unknown[][] };
(globalThis as typeof globalThis & { partnerTestState?: typeof state }).partnerTestState = state;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@/lib/auth/admin') return { url: 'partner-test:auth', shortCircuit: true };
    if (specifier === '@/lib/partners/server') return { url: 'partner-test:server', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'partner-test:auth') return { format: 'module', shortCircuit: true, source: `
      export async function getSessionUser() { return globalThis.partnerTestState.user; }
      export function isAdminUserAllowed(user) { return user?.role === 'admin'; }` };
    if (url === 'partner-test:server') return { format: 'module', shortCircuit: true, source: `
      const call = (...args) => { globalThis.partnerTestState.calls.push(args); return { id: args[0] }; };
      export const convertPartner = call, changePartnerStatus = call, setCommission = call;
      export const getPartners = () => [], getUnconvertedLeads = () => [], getPartnerDetail = call;` };
    return next(url, context);
  },
});
const list = await import('../app/api/admin/partners/route.ts');
const detail = await import('../app/api/admin/partners/[id]/route.ts');
const commission = await import('../app/api/admin/partners/deals/[id]/commission/route.ts');
const { operationError } = await import('./partners/api.ts');
test('typed stale SQL error returns private HTTP 409', () => {
  const response = operationError({ code: '40001' });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
const context = { params: Promise.resolve({ id: lead }) };
const request = (body: unknown) => new Request('http://localhost/api/admin/partners', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
test('all admin APIs reject unauthenticated and non-admin sessions before database access', async () => {
  for (const [user, expected] of [[null, 401], [{ id: 'user' }, 403]] as const) {
    state.user = user; state.calls = [];
    const responses = await Promise.all([
      list.GET(), list.POST(request({ lead_id: lead, role: 'admin' })),
      detail.GET(request({}), context), detail.PATCH(request({ status: 'active' }), context),
      commission.PATCH(request({ expected_updated_at, expected_commission: '10', commission_paid: '0' }), context),
    ]);
    for (const response of responses) {
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal(state.calls.length, 0);
  }
});
test('admin mutations use the authenticated actor and reject invalid payloads', async () => {
  state.user = { id: 'authenticated-admin', role: 'admin' }; state.calls = [];
  assert.equal((await list.POST(request({ lead_id: lead }))).status, 200);
  assert.deepEqual(state.calls[0], [lead, 'authenticated-admin']);
  assert.equal((await detail.PATCH(request({ status: 'inactive' }), context)).status, 200);
  assert.equal((await commission.PATCH(request({ expected_updated_at, expected_commission: '10', commission_paid: '11', override: true }), context)).status, 200);
  assert.deepEqual(state.calls[2], [lead, { expected_updated_at, expected_commission: '10.00', commission_paid: '11.00', override: true }, 'authenticated-admin']);
  const count = state.calls.length;
  assert.equal((await list.POST(request({ lead_id: lead, actor_id: 'fake' }))).status, 400);
  assert.equal((await detail.PATCH(request({ status: 'pending' }), context)).status, 400);
  assert.equal((await commission.PATCH(request({ expected_updated_at, expected_commission: '10', commission_paid: '11' }), context)).status, 400);
  assert.equal(state.calls.length, count);
});
test('partner pages gate queries behind the shared server session authorization', () => {
  for (const page of ['page.tsx', '[id]/page.tsx']) {
    const source = readFileSync(new URL(`../app/admin/partners/${page}`, import.meta.url), 'utf8');
    assert.match(source, /await getSessionUser\(\)/);
    assert.match(source, /if \(!user\) redirect/);
    assert.match(source, /if \(!isAdminUserAllowed\(user\)\) return/);
    assert.ok(source.indexOf('if (!isAdminUserAllowed(user))') < source.indexOf('await getPartnerDetail') || source.indexOf('if (!isAdminUserAllowed(user))') < source.indexOf('await Promise.all'));
  }
});
