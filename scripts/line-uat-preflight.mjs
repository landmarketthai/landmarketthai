// No-send preflight only: no Push endpoint, DB access, token issuance or webhook changes.
import assert from 'node:assert/strict';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const check = (condition, code) => { if (!condition) throw new Error(code); };
const digest = value => createHash('sha256').update(value).digest('hex');

export function verifySignedGroup(input, now = Date.now()) {
  check(typeof input.rawBodyBase64 === 'string' && input.rawBodyBase64.length <= 90000, 'body_required');
  check(typeof input.channelSecret === 'string' && input.channelSecret.length > 0, 'secret_required');
  check(/^C[0-9a-f]{32}$/i.test(input.groupId), 'group_required');
  check(/^\d+$/.test(input.channelId), 'channel_required');
  check(typeof input.token === 'string' && input.token.length > 20 && !/[\r\n]/.test(input.token), 'token_required');
  const raw = Buffer.from(input.rawBodyBase64, 'base64');
  check(raw.length <= 65536 && raw.toString('base64') === input.rawBodyBase64, 'body_encoding');
  const expected = createHmac('sha256', input.channelSecret).update(raw).digest();
  const received = Buffer.from(typeof input.signature === 'string' ? input.signature : '', 'base64');
  check(received.length === expected.length && timingSafeEqual(received, expected), 'signature_invalid');
  const payload = JSON.parse(raw.toString('utf8'));
  check(/^U[0-9a-f]{32}$/i.test(payload.destination), 'bot_destination_required');
  check(Array.isArray(payload.events) && payload.events.length > 0 && payload.events.length <= 15, 'events_required');
  check(payload.events.every(event => event.source?.type === 'group' && event.source.groupId === input.groupId
    && Number.isSafeInteger(event.timestamp) && event.timestamp >= now - 86400000 && event.timestamp <= now + 300000), 'group_or_freshness_mismatch');
  return payload.destination;
}

export async function preflight(input, send = fetch, now = Date.now()) {
  const destination = verifySignedGroup(input, now);
  async function api(path, init = {}) {
    const response = await send(`https://api.line.me${path}`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${input.token}`, ...init.headers },
    });
    check(response.status === 200, 'line_identity_check_failed');
    return response.json();
  }
  // This endpoint verifies existing short/long-lived tokens; it never issues or rotates one.
  const token = await api('/v2/oauth/verify', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: input.token }).toString() });
  check(String(token.client_id) === input.channelId, 'channel_mismatch');
  check(Number(token.expires_in) >= 3600, 'token_window_too_short');
  const bot = await api('/v2/bot/info');
  check(bot.userId === destination, 'signed_bot_mismatch');
  check([bot.basicId, bot.premiumId].includes('@landmarketthai'), 'oa_mismatch');
  const group = await api(`/v2/bot/group/${input.groupId}/summary`);
  check(group.groupId === input.groupId && group.groupName === 'Land Market Thai', 'approved_group_mismatch');
  return { result: 'PASS', verifiedAt: new Date(now).toISOString(), channelId: input.channelId,
    oa: '@landmarketthai', groupName: 'Land Market Thai', groupDigest: digest(input.groupId),
    botDigest: digest(destination), tokenDigest: digest(input.token), realLinePushRequests: 0, liveSendAuthorized: false };
}

async function selfCheck() {
  const now = Date.now(), groupId = `C${'1'.repeat(32)}`, destination = `U${'2'.repeat(32)}`;
  const body = JSON.stringify({ destination, events: [{ timestamp: now, source: { type: 'group', groupId } }] });
  const input = { rawBodyBase64: Buffer.from(body).toString('base64'), channelSecret: 'synthetic-secret',
    signature: createHmac('sha256', 'synthetic-secret').update(body).digest('base64'),
    groupId, channelId: '123456', token: 'synthetic-token-never-valid' };
  let calls = 0;
  const fake = async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    assert.doesNotMatch(url, /access_token|message|webhook/);
    const payload = url.endsWith('/v2/oauth/verify') ? { client_id: '123456', expires_in: 7200 }
      : url.endsWith('/v2/bot/info') ? { userId: destination, basicId: '@synthetic', premiumId: '@landmarketthai' }
      : url === `https://api.line.me/v2/bot/group/${groupId}/summary` ? { groupId, groupName: 'Land Market Thai' } : null;
    assert.ok(payload, 'unexpected outbound endpoint');
    return new Response(JSON.stringify(payload));
  };
  assert.equal((await preflight(input, fake, now)).liveSendAuthorized, false);
  assert.equal(calls, 3);
  for (const override of [{ signature: 'wrong' }, { groupId: `C${'3'.repeat(32)}` }, { rawBodyBase64: '' }]) {
    calls = 0;
    await assert.rejects(preflight({ ...input, ...override }, fake, now));
    assert.equal(calls, 0);
  }
  await assert.rejects(preflight(input, fake, now + 86400001));
  await assert.rejects(preflight({ ...input, channelId: '654321' }, fake, now), /channel_mismatch/);
  await assert.rejects(preflight(input, async () => new Response('{}', { status: 401 }), now));
  for (const change of [{ userId: `U${'4'.repeat(32)}`, basicId: '@landmarketthai' }, { userId: destination, basicId: '@wrong' }]) {
    await assert.rejects(preflight(input, (url, init) => url.endsWith('/v2/bot/info')
      ? Promise.resolve(new Response(JSON.stringify(change))) : fake(url, init), now));
  }
  await assert.rejects(preflight(input, (url, init) => url.endsWith('/summary')
    ? Promise.resolve(new Response(JSON.stringify({ groupId, groupName: 'Wrong group' }))) : fake(url, init), now));
  console.log('PASS signed bytes, freshness, group, token/channel, OA, bot binding, API failure and no-send guards (synthetic transport only)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--self-check') await selfCheck();
    else {
      check(process.argv.length === 2, 'stdin_only');
      console.log('No-send preflight: enter one private JSON line on non-echoing stdin. Never paste credentials into chat.');
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      const input = await new Promise((resolve, reject) => {
        let value = '';
        const timer = setTimeout(() => { process.stdin.pause(); reject(new Error('input_timeout')); }, 60000);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
          value += chunk;
          if (value.includes('\u0003') || value.length > 128000) {
            clearTimeout(timer); process.stdin.pause(); reject(new Error('input_cancelled')); return;
          }
          if (/[\r\n]/.test(value)) {
            clearTimeout(timer); process.stdin.pause(); resolve(value.split(/[\r\n]/)[0]);
          }
        });
      });
      console.log(JSON.stringify(await preflight(JSON.parse(input))));
    }
  } catch {
    // Assertion details, API bodies and parser errors can contain private input.
    console.error('FAIL no-send preflight; reconcile private evidence before any live-send approval.');
    process.exitCode = 1;
  } finally { if (process.stdin.isTTY) process.stdin.setRawMode(false); }
}
