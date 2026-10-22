// LOCAL UAT ONLY. Preloaded into `next start` via NODE_OPTIONS=--import (see scripts/uat-local-e2e.mjs).
// Never deployed. Guards egress so a local run cannot reach real LINE, Cloudflare or any other host:
// - Neon HTTP driver calls (db.localtest.me, which the driver sends to api.localtest.me) go to the local-neon-http-proxy on 127.0.0.1:4444.
// - Turnstile Siteverify is faked: tokens "uat-pass-*" succeed once (single use, like Cloudflare).
// - LINE push is simulated, including one initial timeout; real LINE egress is blocked.
// - Everything else that is not loopback is blocked and recorded.
// (DO Spaces uses the AWS SDK's own HTTP client, not fetch: the run points it at a *.invalid endpoint.)
import { appendFileSync } from "node:fs";

const record = (kind, data) => appendFileSync(process.env.UAT_EVENT_LOG, `${JSON.stringify({ kind, ...data })}\n`);
const realFetch = globalThis.fetch;
const usedTokens = new Set();
let firstLine = true;

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
  if (url.href === "https://api.line.me/v2/bot/message/push") {
    const timeout = firstLine;
    firstLine = false;
    record("line", { body: JSON.parse(init.body), retryKey: init.headers["X-Line-Retry-Key"], accepted: !timeout });
    if (timeout) throw new DOMException("Synthetic timeout", "TimeoutError");
    return Response.json({}, { headers: { "x-line-request-id": "synthetic-uat-evidence" } });
  }
  record("blocked_egress", { url: `${url.origin}${url.pathname}` });
  throw new TypeError("UAT egress blocked");
};
