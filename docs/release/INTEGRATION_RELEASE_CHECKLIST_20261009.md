# Integration Release Checklist — codex/release-integration-20261009

> 2026-10-10: UAT closure, fixes and current gate results are in [LANDMARKETTHAI_UAT_CLOSURE_20261010.md](LANDMARKETTHAI_UAT_CLOSURE_20261010.md); its blocker list supersedes the one below.

Scope: integration branch only. Not pushed, not merged to `main`, not deployed.
No production database, production secret, preview, or external DB was touched.

**Engineering: GO. Production: NO-GO** until every item in "Blockers requiring owner" is closed.

## Contents

| Commit | What |
|---|---|
| `8e79278` | Merge security hardening (PR #10, tip `234861a`) into zoning (PR #9, `e5ddf4f`) |
| `72344f6` | Merge zoning `794de73` (middleware moved to `src/middleware.ts`). Clean auto-merge; `234861a` and `794de73` both verified ancestors |
| `50d560f` | Integration fixes + this checklist |
| this commit | Fix two P1s found by independent Codex review (open redirect, draft-quota exhaustion) |

## Fixes made during integration (with regression tests)

1. **Middleware ran on every public route.** `794de73` made `src/middleware.ts` live for the first time (root `middleware.ts` was ignored under `src/app`). Its catch-all matcher made every public page, `/sitemap.xml`, `/robots.txt` and `/api/*` load `src/lib/auth/server.ts`, which throws when `NEON_AUTH_COOKIE_SECRET` is missing/short. A misconfigured Preview/Production env would have taken down lead capture and SEO, not just admin.
   Fix: matcher narrowed to `/admin`, `/admin/:path*`, and any path carrying the `neon_auth_session_verifier` query param. Handler logic unchanged.
   Test: `src/lib/auth-middleware.test.ts` "middleware only runs for admin pages and OAuth callbacks…".
2. **Turnstile failure was silent.** Script-load failure or challenge error (ad-blocker, Cloudflare unreachable) left submit disabled with no explanation on LeadForm, SubmitLandForm and SellWizard.
   Fix: `TurnstileWidget` renders a `role="alert"` message on failure and clears it on success.
   Test: `src/lib/security/lead-actions.test.ts` "Turnstile load or challenge failure tells the user…".
3. `.env.local.example`: added `RATE_LIMIT_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAMES`, `HUMAN_VERIFICATION_REQUIRED`.

## P1 fixes after independent Codex review (this commit)

### P1 #1 — Login open redirect
- **Bug:** `LoginClient` accepted `next` if `startsWith("/") && !startsWith("//")`. `/\evil.example` passed; the browser / App Router resolves it as `//evil.example`, so an already-logged-in user opening `/login?next=%2F%5Cevil.example` was sent off-site by `router.replace`. The same value fed the Google OAuth `callbackURL`.
- **Fix:** `src/lib/safe-redirect.ts` `safeNextPath()` — one canonical validator used by `LoginClient` (redirect + callbackURL) and `/auth/callback`. Accepts only "/" + printable ASCII without backslash (tabs, newlines, controls, raw Unicode and backslash rejected before parsing); the WHATWG parse must stay on a sentinel origin; the path is decoded once and rejected if it contains "//", backslash, dot segments or controls; output starting "//" is rejected. `/login`, `/login/` map to "/". Everything else hard-fails to "/".
- **Still works:** `/manage/zoning`, `/admin/leads?status=new&page=2`, `/admin/deals/<id>#notes`, percent-encoded Thai paths/queries, "//" inside query or hash.
- **Limit:** raw (not percent-encoded) non-ASCII `next` now falls back to "/". All current producers are ASCII or `encodeURIComponent`ed; new producers must keep that.
- **Tests:** `src/lib/safe-redirect.test.ts` (6): 37 attack strings (backslash, `/.//`, `%5C`, `%2F%2F`, `%2e%2e%2f`, tab/CR/LF, NUL, fullwidth solidus, ideographic full stop, zero-width space, schemes, overlength, `/login`); legit cases; modeled navigation (`new URL(next, location)` and `${origin}${next}`, raw and via `?next=` round trip); the **real `LoginClient` executed** with stubbed hooks, asserting both `router.replace` and `signIn.social({ callbackURL })`; the real `/auth/callback` route. Mutation check: against the pre-fix `LoginClient` the component test fails on `"/\\evil.example"`.

### P1 #2 — Global seller-draft quota exhaustion
- **Bug:** `POST /api/property-submissions` had no human check (10/IP/h, 500 global/h). Reproduced on real Postgres 16 (throwaway local Docker container, real migration SQL): 50 client hashes x 10 calls = 500 allowed, global row 501, then a new legitimate seller got `retry_after=3600` (locked out for an hour).
- **Fix (cap not raised):**
  - Route: `guardPublicWrite(request, "property_draft_create", { human: "strict" })`. Human check runs **before** the limiter, so tokenless / forged / replayed requests never touch per-IP or global rows.
  - `humanVerificationEnforced(strict)`: strict routes are always verified when `VERCEL_ENV === "production"`, regardless of `HUMAN_VERIFICATION_REQUIRED`. Missing `TURNSTILE_SECRET_KEY` in Production = 503 (fail closed: no quota, no DB). Siteverify outage/timeout = 503. Local and Preview follow the flag, so development needs no keys. Leads / buyer / submit routes unchanged (still flag-gated).
  - Turnstile tokens are single-use at Cloudflare: one solved token replayed across IPs yields one draft.
  - `SellWizard`: separate `draftTurnstile` widget (`action="property-draft"`, interaction-only) mounted at the top of the form until a draft exists. Lazy-draft UX kept: viewing creates nothing; the first edit waits (status "กำลังยืนยันตัวตนก่อนสร้างแบบร่าง...") until a token exists, then creates once. `ensureDraft` never POSTs without a token, sends `x-turnstile-token`, resets the widget after every attempt (fresh token per retry), shows the server's 403/429/503 message. A 429 (hour-long per-IP lock) stops the 5 s auto-retry; manual save still works.
- **Tests:** `src/lib/security/draft-create-quota.test.ts` (5) runs the real route + `guardPublicWrite` + Turnstile verifier + `rate-limit.ts` + `client-ip.ts`; only the DB (in-memory mirror of `consume_rate_limit`, client row before global row) and Siteverify (single-use tokens) are faked:
  - 50 IPs x 10 tokenless: all 403, 0 limiter calls, global row 0, 0 Siteverify calls; then a real seller with a token gets 201.
  - 50 forged tokens: 403. One solved token replayed from 50 IPs concurrently: exactly one 201, global row 1.
  - Missing secret: 503. Siteverify down for 20 retries: 503, zero quota.
  - Verified seller: 10 x 201, then 429 + `Retry-After: 3600`, global stays 10; another seller still gets 201.
  - Env gating: local / preview / development without flag = 201; Preview + flag + Cloudflare dummy secret = 403 tokenless / 201 with token; Production enforces strict routes only.
  - `seller-reliability.test.ts`: first edit schedules nothing until a token exists; real `ensureDraft` executed: no token = no fetch; tokens cf-1..cf-4 each sent once; 4 resets; 403 retryable, 429 not; 5xx keeps the Thai generic message.
  - Mutation check: against the pre-fix route, 4 of 5 quota tests fail.
- **Residual risk (accepted):** a paid Turnstile solver farm / real browsers on 50+ IPs can still spend 500 verified drafts per hour. Later: alert on `property_draft_create` global exhaustion, check Siteverify `action`. The same lockout shape exists on `leads` (300/10 min) and `buyer_requirements` until `HUMAN_VERIFICATION_REQUIRED=true` (now required from the first production release, step 12), and on `maps_link` (1500/10 min, no human check).
- Independent read-only Sonnet 5.5 challenge review: no P0/P1; its P2 on the 429 retry loop was fixed here; its other P2/P3 notes are in this checklist (real keys, VERCEL_ENV exposure, leads strictness, solver farms).

## Local verification (synthetic secrets only, Node v24.16.0, Next 15.5.24)

Re-run for the P1 commit:

| Check | Result |
|---|---|
| `npm test` | 305 pass / 0 fail (293 before; +11 new tests, +1 extended) |
| `npm run lint` / `npx tsc --noEmit` | exit 0 / exit 0 |
| `npm run build` (no `DATABASE_URL`, synthetic cookie secret, loopback auth URL) | exit 0, 38 static pages, Middleware 74.5 kB |
| Real Postgres 16 (local Docker, throwaway, real migration) | pre-fix exploit reproduced (seller `retry_after=3600`); client-first confirmed (one client, 15 calls: 5 denied, global row 10) |
| `next start`, `VERCEL_ENV=production`, no Turnstile secret | tokenless and forged draft POST: 503 `human_verification_unavailable` |
| `next start`, `VERCEL_ENV=production`, Cloudflare always-fail dummy secret `2x…AA` | tokenless: 403 (rejected locally); forged: 403 (real Siteverify call with the public dummy secret) |
| `next start`, `VERCEL_ENV=preview`, flag off | guard passes; 500 only because there is no DB (expected) |
| `next start` `/auth/callback?next=%2F%5Cevil.example` and `%2F.%2F%2Fevil.example` | 307 to "/"; `/manage/zoning?tab=a` preserved |

Not verified locally: browser rendering of the second Turnstile widget, a real Turnstile site key, real Neon writes.

Original integration run:


| Check | Result |
|---|---|
| `npm test` | 293 pass / 0 fail (291 before fixes + 2 regression tests) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` (no `DATABASE_URL`, synthetic cookie secret, loopback auth URL) | exit 0, 38 static pages, `ƒ Middleware 74.5 kB`; manifest matchers = `/admin`, `/admin/:path*`, `/:path*` + `has neon_auth_session_verifier` |
| `npm run build` with an unreachable synthetic `DATABASE_URL` | FAILS at `/sitemap.xml` prerender (pre-existing, intentional: demands query is not swallowed). Build must run with either no `DATABASE_URL` or a reachable one |
| `next start` on 127.0.0.1:3107, synthetic secret | `/` 200, `/sitemap.xml` 200, `/robots.txt` 200, `/sell` 200, `/admin` 307→`/login`, `/admin/leads` 307→`/login`, `/api/admin/leads` 401, `/adminX` 404, `/?neon_auth_session_verifier=…` 307→`/login` |
| `next start` with `NEON_AUTH_COOKIE_SECRET` unset | `/`, `/sitemap.xml`, `/sell`, `/contact` 200; `/admin` 500 (fail-closed only on admin) |

Not verified locally: real Google OAuth round-trip, real Turnstile, Neon DB reads/writes, n8n, DO Spaces uploads.

## Read-only QA summary (3 parallel reviewers)

- **A. OAuth/admin/provenance:** all `/api/admin/**` handlers enforce session + admin (401/403); admin pages gate server-side (except `admin/properties/[id]`, a shell whose data API enforces admin — low). Public submissions cannot set `map_checked`/`document_verified` (schema + `publicOwnerZoning` + DB CHECK). No Supabase client, no `DATABASE_URL` in client bundles. No migration runs on build/postinstall.
- **B. Seller lazy draft + Turnstile:** page view creates no draft; draft created once (ref de-dupe), first edit not lost; merge kept no duplicate hunks; zoning saves/loads; 409 path intact. Every public write path has the shared limiter + body cap; human check on leads, buyer requirements, draft submit.
- **C. Runbook:** zoning (`neon/migrations/202610080001_zoning_info.sql`) and rate-limit (`db/migrations/20261009_public_write_rate_limits.sql`) migrations are independent and re-runnable; both must be applied before deploy.

### Known, accepted (not fixed; low severity)

- `PATCH /api/property-submissions/[id]` has a 64 KB cap but no rate limit (gated by draft UUID token; deliberate).
- `NEON_AUTH_BASE_URL` unset falls back to the production auth endpoint (`src/lib/auth/server.ts`). Preview/UAT must set it explicitly. `CLAUDE.md` mentions `NEXT_PUBLIC_NEON_AUTH_URL`, which code does not read.
- If `HUMAN_VERIFICATION_REQUIRED=true` but the build lacked `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, every lead form returns 403 with no widget. The site key must be set before the production build (step 12 before step 13 below).
- `neon/README.md` says "merge `develop` to `main`"; `neon/ZONING_RELEASE_REHEARSAL.md` evidence predates both merges (this checklist supersedes its local test numbers).

## Release sequence (owner-run; nothing here has been executed)

> Revised 2026-10-10 after the Codex Sol 6.1 runbook audit. Replaces the earlier 10-step list, which put the production
> migration before Preview UAT and owner permission. Each phase starts only after the previous one is signed off.
> **No production mutation (Neon DDL/DML, Vercel Production env change, merge to `main`, production deploy) before Phase C.**

**Phase A — isolated migration rehearsal (non-production only, must pass 100%)**
1. Neon: create a disposable child branch of UAT `br-noisy-sun-az5krbgi` (never of production `br-solitary-mud-az74nksn`).
2. On it, as the app role (`landmarketthai_owner` on UAT): `scripts/zoning-preflight.sql` → `neon/migrations/202610080001_zoning_info.sql` → `scripts/zoning-postflight.sql` → **re-apply** `db/migrations/20261009_public_write_rate_limits.sql` (UAT still has the pre-fix function without `skip locked`) → `docs/security/PUBLIC_WRITE_HARDENING.md` Step 1 verify + ownership check (disposable `release_verify` bucket only).
3. Rollback rehearsal there: `scripts/zoning-rollback.sql` twice, reapply migration, data unchanged. Any failure = stop.
4. Re-apply the patched rate-limit migration on UAT `br-noisy-sun-az5krbgi` itself so Preview matches.

**Phase B — combined Preview UAT (non-production only)**
5. Preview env stays non-production: `DATABASE_URL` / `NEON_AUTH_BASE_URL` = UAT `br-noisy-sun-az5krbgi`; n8n webhook disabled or a test sink; DO Spaces test bucket only; Turnstile = Cloudflare dummy pair (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`, always pass) with `HUMAN_VERIFICATION_REQUIRED=true`. Never put dummy keys in Production.
6. Preview deploy of the reviewed SHA; run "Preview browser UAT" below. Real DO Spaces upload and one real n8n event to a test sink are **BLOCKED** (no test bucket/sink yet): they must pass, or the owner must explicitly waive them.

**Phase C — owner authorization (gate)**
7. Owner signs off Phases A and B and gives **explicit production release permission**, including business approval of Kabin Buri 101 rai verified → pending with green zoning. Neither has been given as of 2026-10-10.

**Phase D — production snapshot and read-only preflight**
8. Neon: create a restore branch/snapshot of production; record ID and timestamp.
9. `scripts/zoning-preflight.sql` read-only against explicitly identified production `br-solitary-mud-az74nksn` (direct connection). Any STOP row = stop. Confirm which role the production app `DATABASE_URL` uses; it must apply (own) the limiter objects. No writes in this phase.

**Phase E — schema first, then app**
10. Apply `neon/migrations/202610080001_zoning_info.sql` as the app role; run `scripts/zoning-postflight.sql`. Expected: Kabin 101 rai green / `owner_reported`, verified −1, pending +1.
11. Apply `db/migrations/20261009_public_write_rate_limits.sql` as the app role; run Step 1 verify and ownership check **only with the `release_verify` bucket**. Never delete or update a live bucket (`leads`, `buyer_requirements`, …) or any global `'*'` row in production.
12. Vercel Production env (real Cloudflare keys are already set there but no deployment has been built with them yet): confirm real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAMES` (apex and `www` if both serve), **`HUMAN_VERIFICATION_REQUIRED=true` (exactly) from this first release**, `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32), `ADMIN_EMAILS`, `N8N_WEBHOOK_LEADS`, `DO_SPACES_*`, optional `RATE_LIMIT_SECRET`; "Automatically expose System Environment Variables" ON (else `VERCEL_ENV` is missing and strict draft gating silently does nothing; step 14 catches it). The site key is inlined at build time, so it must be present before step 13.
13. Merge to `main` and production deploy (fresh build).
14. Post-deploy smoke (no load tests, no DB deletes): `scripts/zoning-smoke.mjs`; widget visible on lead, buyer, partner, `/sell`; tokenless `POST` to `/api/leads`, `/api/buyer-requirements`, `/api/property-submissions` each 403 (not 201, not 503); one real browser lead and one `/sell` edit succeed (exactly one draft); Google OAuth into `/admin` and `/manage/zoning`; logged in, `/login?next=%2F%5Cevil.example` lands on `/`.

Why the flag is on from the first release: with it off, `/api/leads` (300 / 10 min global), `/api/buyer-requirements`, the lead Server Actions and draft submit accept tokenless requests, so a bot can exhaust the global quota and lock out real leads. Seller draft create (`human: "strict"`) is verified on Vercel Production whatever the flag says. Missing secret or Siteverify unreachable / non-200 = 503 on every verified route (fail closed; no quota spent).

### Preview browser UAT

- Public: `/`, `/land`, a `/property/<slug>` for 37 Rai EEC Rayong and 101 Rai Kabin Buri (zoning shown, no invented official facts), `/sitemap.xml`, `/robots.txt`.
- Lead flow: LeadForm and SubmitLandForm (API), PartnerForm (Server Action path, real browser) and BuyerRequirementForm submit end-to-end on isolated Preview. A test n8n sink is expected to receive events **only for the lead API and lead Server Actions**, not for buyer requirements or seller submissions (their lead rows are instead verified in Neon UAT and the Admin queue). Real webhook delivery is BLOCKED until a dedicated test sink exists; whether those other lead types should notify n8n is a product decision.
- Seller: open `/sell`, confirm no draft row created on view; edit one field, confirm exactly one draft (POST carries `x-turnstile-token`; status shows verifying until the token arrives); upload to DO Spaces test bucket (BLOCKED until one exists); submit with Turnstile (separate second token).
- Redirect: logged in, open `/login?next=%2F%5Cevil.example`, `/login?next=%2F%2Fevil.example`, `/login?next=%2Fmanage%2Fzoning`; expect `/`, `/`, `/manage/zoning`.
- Turnstile failure: block `challenges.cloudflare.com`, confirm alert text appears.
- Admin: Google OAuth login lands back authenticated (verifier param handled); non-admin account gets 403; admin edits zoning with 409 on stale edit.

### Rollback (rehearsed on a Neon UAT child branch in Phase A before release)

- App: promote the previous known-good Vercel production deployment. This is the only full app rollback.
- Turnstile: unsetting `HUMAN_VERIFICATION_REQUIRED` + redeploy turns verification off only for leads, buyer requirements, lead Server Actions and draft submit, and re-opens the tokenless global-quota lockout on them (short-term only). Seller draft **create** stays verified on Production regardless; if Turnstile config is broken, fix the keys and redeploy, or promote the previous deployment.
- Zoning guards: `scripts/zoning-rollback.sql` (idempotent, keeps data).
- Rate limits: leave in place (unused by the old app), or
  `drop function if exists consume_rate_limit(text,text,int,int,int); drop table if exists public_write_rate_limits;`
- Data corruption: Neon restore to the step-8 checkpoint (loses writes after it).

## Blockers requiring owner

Superseded by [LANDMARKETTHAI_UAT_CLOSURE_20261010.md](LANDMARKETTHAI_UAT_CLOSURE_20261010.md) §7; release order is the phased sequence above.
