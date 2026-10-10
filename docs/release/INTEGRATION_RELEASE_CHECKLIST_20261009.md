# Integration Release Checklist — codex/release-integration-20261009

Scope: integration branch only. Not pushed, not merged to `main`, not deployed.
No production database, production secret, preview, or external DB was touched.

**Engineering: GO. Production: NO-GO** until every item in "Blockers requiring owner" is closed.

## Contents

| Commit | What |
|---|---|
| `8e79278` | Merge security hardening (PR #10, tip `234861a`) into zoning (PR #9, `e5ddf4f`) |
| `72344f6` | Merge zoning `794de73` (middleware moved to `src/middleware.ts`). Clean auto-merge; `234861a` and `794de73` both verified ancestors |
| this commit | Integration fixes + this checklist |

## Fixes made during integration (with regression tests)

1. **Middleware ran on every public route.** `794de73` made `src/middleware.ts` live for the first time (root `middleware.ts` was ignored under `src/app`). Its catch-all matcher made every public page, `/sitemap.xml`, `/robots.txt` and `/api/*` load `src/lib/auth/server.ts`, which throws when `NEON_AUTH_COOKIE_SECRET` is missing/short. A misconfigured Preview/Production env would have taken down lead capture and SEO, not just admin.
   Fix: matcher narrowed to `/admin`, `/admin/:path*`, and any path carrying the `neon_auth_session_verifier` query param. Handler logic unchanged.
   Test: `src/lib/auth-middleware.test.ts` "middleware only runs for admin pages and OAuth callbacks…".
2. **Turnstile failure was silent.** Script-load failure or challenge error (ad-blocker, Cloudflare unreachable) left submit disabled with no explanation on LeadForm, SubmitLandForm and SellWizard.
   Fix: `TurnstileWidget` renders a `role="alert"` message on failure and clears it on success.
   Test: `src/lib/security/lead-actions.test.ts` "Turnstile load or challenge failure tells the user…".
3. `.env.local.example`: added `RATE_LIMIT_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAMES`, `HUMAN_VERIFICATION_REQUIRED`.

## Local verification (synthetic secrets only, Node v24.16.0, Next 15.5.24)

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

- `SellWizard` draft-create failure shows a generic message and retries every 5 s regardless of status (including 429). Fix later: surface server `error`, retry only on 5xx / honour `Retry-After`.
- `PATCH /api/property-submissions/[id]` has a 64 KB cap but no rate limit (gated by draft UUID token; deliberate).
- `NEON_AUTH_BASE_URL` unset falls back to the production auth endpoint (`src/lib/auth/server.ts`). Preview/UAT must set it explicitly. `CLAUDE.md` mentions `NEXT_PUBLIC_NEON_AUTH_URL`, which code does not read.
- If `HUMAN_VERIFICATION_REQUIRED=true` but the build lacked `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, every lead form returns 403 with no widget. Always set the site key and rebuild before flipping the flag.
- `neon/README.md` says "merge `develop` to `main`"; `neon/ZONING_RELEASE_REHEARSAL.md` evidence predates both merges (this checklist supersedes its local test numbers).

## Release sequence (owner-run; nothing here has been executed)

1. Cloudflare: create a Turnstile widget for the production hostname(s).
2. Neon: create a restore branch/snapshot of production; record its ID and timestamp.
3. Run `scripts/zoning-preflight.sql` read-only against the explicitly identified production branch (direct connection). Any STOP row = do not migrate.
4. Apply `neon/migrations/202610080001_zoning_info.sql`; run `scripts/zoning-postflight.sql`. Expected: Kabin Buri 101 rai becomes green / `owner_reported`, `verification_status` verified → pending (verified −1, pending +1).
5. Apply `db/migrations/20261009_public_write_rate_limits.sql`; run the verify SQL in `docs/security/PUBLIC_WRITE_HARDENING.md` (no grants to `anonymous`/`authenticated`/`anon`).
6. Vercel env (Preview and Production): confirm `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32), `ADMIN_EMAILS`, `N8N_WEBHOOK_LEADS`, `DO_SPACES_*`; add `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAMES`, optional `RATE_LIMIT_SECRET`. Leave `HUMAN_VERIFICATION_REQUIRED` unset.
7. Preview deploy of this branch; combined browser UAT (below).
8. Merge to `main` / production deploy — only with explicit release permission.
9. Post-deploy: `scripts/zoning-smoke.mjs`; Turnstile widget visible on lead, buyer, partner, `/sell`; Google OAuth into `/admin` and `/manage/zoning`.
10. Set `HUMAN_VERIFICATION_REQUIRED=true`, redeploy (fresh build), confirm a no-token `POST /api/leads` returns 403 and a real browser submit succeeds.

### Preview browser UAT

- Public: `/`, `/land`, a `/property/<slug>` for 37 Rai EEC Rayong and 101 Rai Kabin Buri (zoning shown, no invented official facts), `/sitemap.xml`, `/robots.txt`.
- Lead flow: LeadForm, SubmitLandForm, PartnerForm, BuyerRequirementForm submit end-to-end; n8n receives each lead.
- Seller: open `/sell`, confirm no draft row created on view; edit one field, confirm exactly one draft; upload to DO Spaces; submit with Turnstile.
- Turnstile failure: block `challenges.cloudflare.com`, confirm alert text appears.
- Admin: Google OAuth login lands back authenticated (verifier param handled); non-admin account gets 403; admin edits zoning with 409 on stale edit.

### Rollback (must be tested on the Neon restore branch before release)

- App: promote previous Vercel production deployment.
- Turnstile: unset `HUMAN_VERIFICATION_REQUIRED`, redeploy.
- Zoning guards: `scripts/zoning-rollback.sql` (idempotent, keeps data).
- Rate limits: leave in place (inert; app falls back to per-instance limiter), or
  `drop function if exists consume_rate_limit(text,text,int,int,int); drop table if exists public_write_rate_limits;`
- Data corruption: Neon restore to the step-2 checkpoint (loses writes after it).

## Blockers requiring owner

1. Real Turnstile site + secret keys and the production hostname list.
2. Business-owner approval to change Kabin Buri 101 rai from verified → pending and show green zoning.
3. Neon restore checkpoint created and ID recorded.
4. Rollback (zoning-rollback.sql + app rollback) tested on a Neon branch.
5. Preview deploy + combined browser UAT signed off.
6. Explicit production release permission.
