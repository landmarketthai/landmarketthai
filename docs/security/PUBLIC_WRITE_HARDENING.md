# Public Write Endpoint Hardening (operator runbook)

Status: **NOT enabled in production until the operator completes the deploy steps below.**
The app limiter is **not dark**: once new code is deployed it limits requests immediately, using a per-instance fallback until its Neon migration runs. Human verification is off for leads / buyer requirements / draft submit until `HUMAN_VERIFICATION_REQUIRED=true`, which must be set from the first production release (Step 3); seller draft create is always verified on Vercel Production.
**Release blocker:** without enabled Turnstile (or effective upstream anti-bot protection), a botnet can exhaust a shared route cap and deny legitimate leads. Verify Preview with real site/secret keys and end-to-end form submits first; do not deploy this code to Production with an unprotected 300-leads-per-10-minute global ceiling.
No production Neon migration, Vercel firewall change, or Cloudflare Turnstile activation was performed by this workstream. Audit basis: `fe057c8` plus follow-up tests and reviewed SellWizard token handling.

## 1. Threat model

Anonymous internet clients can create DB rows (leads, buyer requirements, drafts, events),
trigger outbound calls (n8n webhook on every accepted lead, Cloudflare siteverify, Google Maps
short-link expansion) and obtain presigned DigitalOcean Spaces upload URLs. Attacker goals:
spam the sales pipeline and n8n notifications, fill Neon or Spaces (cost), host files on the
public-read CDN, make the lead form unavailable to real users, scrape or enumerate.
Admin routes are cookie-authenticated and are listed for completeness.

## 2. Endpoint table

Body cap: "app" = enforced in code (413); "platform" = only Vercel's request body limit
(about 4.5 MB for Functions, verify current docs). Oversized bodies get 413 `payload_too_large` (events drop silently).

| Route | Method | Auth | App rate limit (per client / global, window) | Human check | Body cap |
|---|---|---|---|---|---|
| /api/leads | POST | none (honeypot `_hp`) | 5 / 300, 10 min | Turnstile when enabled | app 10 KB |
| Server Actions submitPartnerLead / submitOwnerLead / submitBuyerLead (`src/app/actions/leads.ts`, used by PartnerForm) | POST (Next action) | none (honeypot `_hp`) | shares the `leads` bucket: 5 / 300, 10 min | Turnstile when enabled (FormData `turnstile_token`) | Next.js Server Action default (1 MB) |
| /api/buyer-requirements | POST | none | 6 / 300, 10 min | Turnstile when enabled | app 20 KB |
| /api/property-submissions | POST | none (returns id + draft token) | 10 / 500, 1 h | Turnstile `strict`: when enabled, and ALWAYS on Vercel Production (`VERCEL_ENV=production`) | n/a |
| /api/property-submissions/[id] | GET | x-draft-token | none | none | n/a |
| /api/property-submissions/[id] | PATCH | token in body | none (token-gated autosave) | none | app 64 KB |
| /api/property-submissions/[id]/submit | POST | token in body | 5 / 200, 10 min | Turnstile when enabled | app 4 KB |
| /api/property-submissions/[id]/uploads/presign, /confirm | POST | draft token | 60 / 2000, 10 min | none (image kind must be image/* MIME) | app 4 KB |
| /api/uploads/presign, /confirm | POST | only a lead UUID (not a secret) | 30 / 1000, 10 min; confirm checks stored size + type | none | app 4 KB |
| /api/maps-link | POST | none | 30 / 1500, 10 min | none | app 4 KB |
| /api/events | POST | none | 300 / 20000, 10 min (over-limit dropped silently) | none | app 4 KB |
| /api/properties/search, /api/thai-admin | GET | none | none (CDN cache only) | none | n/a |
| /api/admin/** (12 files, incl. zoning/[id]) | GET/POST/PATCH | session cookie + admin check inside every handler (middleware skips /api/admin) | none | none | platform |
| /api/auth/[...path] | all | Neon Managed Better Auth proxy | upstream only | none | platform |
| /auth/callback | GET | none (legacy redirect) | none | none | n/a |

## 3. What the app-level limiter does and does NOT do

Does: atomic per-route, per-client counters in Neon (`consume_rate_limit`). Client key is the HMAC of
`x-real-ip`, else the first `x-forwarded-for` entry (Vercel overwrites these and does not forward
client-supplied values; this is NOT safe if you ever self-host or put another proxy in front).
IPv6 is collapsed to /64. Each route also has a global ceiling.

Does NOT:
- Stop distributed abuse. A residential-proxy botnet has thousands of IPs; per-IP limits barely slow it.
  Turnstile and Vercel WAF are the real controls; the limiter is a backstop.
- Come free of a trade-off: the global ceiling protects n8n and the DB but lets one attacker exhaust a
  route for everyone (about 300 requests per 10 min makes /api/leads return 429 to real users).
  When human verification is required it runs BEFORE the limiter, so token-less bots cannot consume the
  global budget; with it off, anyone can.
  Watch 429 rates after launch and tune `RATE_LIMITS` in `src/lib/security/rate-limit.ts`.
- Work during a DB outage beyond a weak backstop: on DB error it falls back to a per-process map that
  allows a reduced cap per instance (half the per-client limit, a tenth of the global ceiling; a full map denies new clients), so the effective ceiling multiplies by instance count.
- Authenticate anyone, validate file content, or limit total storage per lead or draft.
- Cover GET endpoints or `/api/auth/*`.

## 4. Deploy steps (in order)

### Step 1. Apply the migration (Neon preview branch first)
Apply `db/migrations/20261009_public_write_rate_limits.sql` to a Neon preview branch, test, then to
production **before or together with** the deploy (without it every request uses the weak per-instance fallback and logs `[rate-limit] database limiter unavailable` once a minute).
Verify:
```sql
select to_regclass('public.public_write_rate_limits') as tbl,
       (select count(*) from pg_proc where proname = 'consume_rate_limit') as fn;  -- tbl not null, fn = 1
-- Use a throwaway bucket: never touch the live 'leads' global row.
select consume_rate_limit('release_verify', repeat('a',64), 1, 100, 60);  -- 0 (allowed)
select consume_rate_limit('release_verify', repeat('a',64), 1, 100, 60);  -- >0 (seconds to wait)
delete from public_write_rate_limits where bucket = 'release_verify';
```
Confirm the Data API roles (anon/authenticated) have no grants on the table or function.
Run the migration AS the role in the app's `DATABASE_URL` (the table owner). The function is not
SECURITY DEFINER and nothing is granted, so a different app role gets `permission denied` and the app
silently uses the weak per-instance fallback (rehearsed on PostgreSQL 18). Check as the app role:
`select has_function_privilege('consume_rate_limit(text,text,int,int,int)', 'EXECUTE') and has_table_privilege('public_write_rate_limits', 'INSERT,UPDATE,DELETE');` must be true.

### Step 2. RATE_LIMIT_SECRET (optional)
Set a random 32+ character `RATE_LIMIT_SECRET` (Production and Preview). Otherwise it falls back to
`NEON_AUTH_COOKIE_SECRET`. Rotating it only resets counters.

### Step 3. Turnstile rollout (order matters)
1. Cloudflare dashboard: create a Turnstile widget for the production hostname(s) (and preview if wanted).
2. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (server only). Optionally set
   `TURNSTILE_EXPECTED_HOSTNAMES` (comma separated; without it the hostname is not checked).
3. Preview first (Cloudflare dummy keys allowed only there): flag on, verify the widget renders on the
   lead form, the buyer form and the /sell steps, and that submissions succeed.
4. Production: set `HUMAN_VERIFICATION_REQUIRED=true` (exactly `true`) together with the real keys
   **before the first production build**. Never ship this code to Production with the flag off: leads and
   buyer requirements would accept tokenless posts that can exhaust the global quota. If the secret is
   missing or Siteverify is unreachable, verified routes fail closed with 503.
   Full release order: `docs/release/INTEGRATION_RELEASE_CHECKLIST_20261009.md` (phases A–E).
5. Rollback: unset `HUMAN_VERIFICATION_REQUIRED` and redeploy (short-term only; re-opens the tokenless
   lockout). No code change needed for leads, buyer requirements and draft submit. Draft CREATE (`/api/property-submissions`) stays verified on Vercel
   Production regardless of the flag; there is no env-only kill switch for it. If Turnstile itself is down,
   `/sell` cannot create drafts until Cloudflare recovers, the keys are fixed, or the previous known-good
   deployment is promoted (accepted trade-off of P1 #2).

### Step 4. Recommended Vercel Firewall setup (described only, NOT applied)
Availability and cost of WAF rate limiting, Bot Protection and any usage-based pricing vary by plan and
change over time; confirm in the Vercel dashboard before relying on them. Start every rule in
**Log** mode, review traffic for a few days, then enforce.

| Rule (POST on path) | Suggested threshold per IP | Action |
|---|---|---|
| /api/leads, /api/buyer-requirements | 10 / 1 min | Rate limit (429), 10 min block |
| /api/property-submissions (and children) | 30 / 1 min | Rate limit |
| /api/uploads/* | 30 / 1 min | Rate limit |
| /api/maps-link | 20 / 1 min | Rate limit |
| /api/events | 120 / 1 min | Rate limit (or Log only) |

- Bot Protection managed ruleset: Log first, then Challenge. Do not apply it to GET pages
  (Googlebot and other crawlers must keep working; SEO).
- Do NOT challenge or block `/api/auth/*` and `/auth/callback` (Google OAuth redirects and the Neon
  session verifier break under a browser challenge), nor `/api/admin/*` calls from the signed-in admin UI.
- Attack Challenge Mode: incident use only. It challenges all visitors including real buyers and may
  interfere with crawlers and API clients. Turn it off when the incident ends.
- WAF rules run before the function, so they are the only control that avoids billable invocations.

### Step 5. Verification checklist (Preview only; never hammer Production)
With `HUMAN_VERIFICATION_REQUIRED=true`, public write routes verify the Turnstile token **before** parsing the body or consuming a rate-limit bucket. A tokenless request must return **403**, not 422, 413 or 429.
```bash
BASE=https://<preview-url>
# 403: missing Turnstile token. Must NOT consume a rate-limit row.
curl -s -w "\n%{http_code}\n" -X POST "$BASE/api/leads" -H 'content-type: application/json' \
  -d '{"lead_type":"buyer"}'
# 401: admin without a session.
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/admin/leads"
# Redirect must stay on this host.
curl -s -o /dev/null -w "%{redirect_url}\n" "$BASE/auth/callback?next=/%09/example.org"
```
Test **422** (invalid payload), **413** (oversized body) and **429** (rate limit) in the isolated local E2E/integration harness or a dedicated test Preview with a **fresh valid single-use Turnstile token for every request**. A tokenless `curl` loop cannot reach those checks, and reusing one solved token also returns 403. Never disable human verification on Production or reset the live `leads` global bucket to make a test pass. See `scripts/uat-local-e2e.mjs`, `src/lib/security/lead-actions.test.ts` and `src/lib/security/draft-create-quota.test.ts`. For a permitted test environment, assert that a per-client rejection does not spend global quota and that spoofed forwarded headers do not create new client identities.

Read-only inspect `select bucket, count(*) from public_write_rate_limits group by 1;` on the explicitly identified UAT branch and verify runtime logs have no repeated `[rate-limit] database limiter unavailable`.

## 5. Known gaps not closed by this change
Fixed in this branch: `/auth/callback` open redirect (origin comparison), `error.message` leakage in /api/uploads/*,
lead upload confirm now checks stored size/type, image uploads restricted to image/* MIME types.
Still open: lead uploads are gated only by the lead UUID returned to the submitter (no per-lead upload secret,
no per-lead file count/total size cap); no magic-byte validation; unconfirmed Spaces objects are never cleaned
up (add a bucket lifecycle rule); no Origin check on admin mutations (SameSite=Lax cookie mitigates); no limits
on draft PATCH/GET or search GET; `events` and `public_write_rate_limits` have no scheduled retention job.
