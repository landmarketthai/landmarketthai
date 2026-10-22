// Operator-only UAT adapter; never imported by the application or enabled by the preflight CLI.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync, appendFileSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineRequest } from '../src/lib/line/delivery.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const check = condition => { if (!condition) throw new Error('uat_window_closed'); };
export function boundedUatTransport({ config, proof, jobs, approval, expiresAt, journalPath }, send = fetch) {
  const now = Date.now();
  check(approval === 'APPROVED: five alerts, seven Push requests');
  check(proof?.result === 'PASS' && proof.groupDigest === digest(config.groupId) && proof.tokenDigest === digest(config.token));
  check(Date.parse(proof.verifiedAt) <= now && Date.parse(proof.verifiedAt) >= now - 600000);
  check(expiresAt > now && expiresAt <= now + 3600000);
  check(config.siteUrl === 'https://landmarketthai-git-codex-native-line-outbox-landmarketthai.vercel.app');
  check(Array.isArray(jobs) && jobs.length === 5 && new Set(jobs.map(j => j.event)).size === 5);
  const requests = new Map(jobs.map(job => {
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(job.retryKey));
    return [job.retryKey, JSON.stringify(lineRequest(job.event, config))];
  }));
  check(requests.size === 5);
  // Exclusive create prevents another process/restart from resetting this window's seven-call budget.
  writeFileSync(journalPath, `${JSON.stringify({ openedAt: new Date(now).toISOString(), groupDigest: proof.groupDigest, expiresAt })}\n`, { flag: 'wx', mode: 0o600 });
  const token = config.token;
  let attempts = 0, closed = false;
  return async (url, init) => {
    check(!closed && attempts < 7 && Date.now() < expiresAt);
    const headers = new Headers(init?.headers);
    const key = headers.get('x-line-retry-key');
    check(url === 'https://api.line.me/v2/bot/message/push' && init?.method === 'POST' && init.redirect === 'error');
    check(headers.get('authorization') === `Bearer ${token}` && requests.has(key) && requests.get(key) === init.body);
    attempts++;
    // Reserve before the request, including timeouts/ambiguous responses. Never log the token or body.
    appendFileSync(journalPath, `${JSON.stringify({ attempt: attempts, retryKey: key, bodyDigest: digest(init.body), at: new Date().toISOString() })}\n`);
    try {
      const response = await send(url, { ...init, signal: AbortSignal.timeout(5000) });
      if (response.status !== 200 && !(response.status === 409 && response.headers.get('x-line-accepted-request-id'))) closed = true;
      return response;
    } catch { closed = true; throw new Error('uat_ambiguous_response_stop'); }
  };
}

async function selfCheck() {
  const directory = mkdtempSync(join(tmpdir(), 'line-uat-budget-'));
  const journalPath = join(directory, 'window.jsonl');
  const failureJournal = join(directory, 'failure.jsonl');
  const config = { token: 'synthetic-token', groupId: `C${'0'.repeat(32)}`,
    siteUrl: 'https://landmarketthai-git-codex-native-line-outbox-landmarketthai.vercel.app' };
  const jobs = ['buyer','owner','partner','buyer_requirement','seller_submission'].map((event, index) => ({ event,
    retryKey: `123e4567-e89b-42d3-a456-42661417400${index}` }));
  const options = { config, jobs, proof: { result: 'PASS', verifiedAt: new Date().toISOString(), groupDigest: digest(config.groupId), tokenDigest: digest(config.token) },
    approval: 'APPROVED: five alerts, seven Push requests', expiresAt: Date.now() + 60000, journalPath };
  let calls = 0;
  try {
    assert.throws(() => boundedUatTransport({ ...options, approval: '' }));
    assert.throws(() => boundedUatTransport({ ...options, proof: {} }));
    assert.throws(() => boundedUatTransport({ ...options, config: { ...config, token: 'changed-token' } }));
    assert.throws(() => boundedUatTransport({ ...options, config: { ...config, siteUrl: 'https://landmarketthai.com' } }));
    const send = boundedUatTransport(options, async () => { calls++; return new Response(null); });
    assert.throws(() => boundedUatTransport(options));
    const request = job => ({ method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${config.token}`, 'X-Line-Retry-Key': job.retryKey }, body: JSON.stringify(lineRequest(job.event, config)) });
    await assert.rejects(send('https://wrong.test', request(jobs[0])));
    await assert.rejects(send('https://api.line.me/v2/bot/message/push', { ...request(jobs[0]), body: '{}' }));
    assert.equal(calls, 0);
    for (const job of [...jobs, jobs[0], jobs[0]]) await send('https://api.line.me/v2/bot/message/push', request(job));
    await assert.rejects(send('https://api.line.me/v2/bot/message/push', request(jobs[1])));
    assert.equal(calls, 7);
    const journal = readFileSync(journalPath, 'utf8');
    assert.equal(journal.trim().split('\n').length, 8);
    assert.ok(!journal.includes(config.token) && !journal.includes(config.groupId) && !journal.includes('/admin/leads'));
    let failures = 0;
    const failed = boundedUatTransport({ ...options, journalPath: failureJournal }, async () => { failures++; return new Response(null, { status: 429 }); });
    await failed('https://api.line.me/v2/bot/message/push', request(jobs[0]));
    await assert.rejects(failed('https://api.line.me/v2/bot/message/push', request(jobs[0])));
    assert.equal(failures, 1);
    console.log('PASS approval/proof/Preview guards, immutable five-key manifest, exclusive journal/restart lock, seven-request ceiling, sanitized journal and stop-on-error (fake transport only)');
  } finally {
    for (const path of [journalPath, failureJournal]) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    rmdirSync(directory);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 3 && process.argv[2] === '--self-check') await selfCheck();
  else { console.error('No live-send CLI. Import only into an explicitly approved isolated UAT harness.'); process.exitCode = 1; }
}
