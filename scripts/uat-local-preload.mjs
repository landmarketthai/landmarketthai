// LOCAL UAT ONLY. Preloaded into `next start` via NODE_OPTIONS=--import (see scripts/uat-local-e2e.mjs).
// Never deployed. Guards egress so a local run cannot reach real n8n, Cloudflare or any other host:
// - Neon HTTP driver calls (db.localtest.me, which the driver sends to api.localtest.me) go to the local-neon-http-proxy on 127.0.0.1:4444.
// - Turnstile Siteverify is faked: tokens "uat-pass-*" succeed once (single use, like Cloudflare).
// - n8n webhook host n8n-sink.invalid is recorded, never sent.
// - Everything else that is not loopback is blocked and recorded.
// (DO Spaces uses the AWS SDK's own HTTP client, not fetch: the run points it at a *.invalid endpoint.)
import { appendFileSync } from "node:fs";

const record = (kind, data) => appendFileSync(process.env.UAT_EVENT_LOG, `${JSON.stringify({ kind, ...data })}\n`);
const realFetch = globalThis.fetch;
const usedTokens = new Set();

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.localtest.me") return realFetch(`http://127.0.0.1:4444${url.pathname}${url.search}`, init);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(input, init);
  if (url.href === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const token = String(JSON.parse(init.body).response);
    const success = token.startsWith("uat-pass-") && !usedTokens.has(token);
    usedTokens.add(token);
    record("siteverify", { success });
    return Response.json({ success, hostname: "localhost" });
  }
  if (url.hostname === "n8n-sink.invalid") {
    record("n8n", { body: JSON.parse(init.body) });
    return Response.json({ ok: true });
  }
  record("blocked_egress", { url: `${url.origin}${url.pathname}` });
  throw new TypeError("UAT egress blocked");
};
