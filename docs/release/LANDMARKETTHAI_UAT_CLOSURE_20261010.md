# LandmarketThai UAT closure — 2026-10-10

Branch `codex/release-integration-20261009`, base `6c21346f381c4ffea00f6dad55c8d57199cb20fe` (the SHA deployed to
Preview `landmarketthai-a4b1z7784-landmarketthai.vercel.app`). Worktree `C:\GitHub\landmarketthai-release-integration-20261009`, clean at start.

**Engineering: GO for this branch (local commit only). Production: NO-GO** until every item in "Blockers requiring owner" is closed.

Nothing was pushed, merged, deployed or opened as a PR. No Vercel, Neon, DNS, mail or key setting was changed.
No SQL was run against Neon (production `br-solitary-mud-az74nksn` and UAT `br-noisy-sun-az5krbgi` were both untouched).
No real lead, n8n call, Turnstile Siteverify call or DO Spaces request was made. All database work used a throwaway
local Docker PostgreSQL 18.6 container with synthetic rows.

## 0. Current state (updated after the Codex Sol 6.1 runbook audit, 2026-10-10)

- Code under test: `0c8faa7`. Local gates: 308/308 `npm test`, 16/16 local E2E (§3) against disposable PostgreSQL 18; no Neon, Vercel or external call.
- Production Vercel: real Cloudflare Turnstile keys are set in the env but **no production deployment has been built with them yet** (site key is inlined at build).
- Preview: env points at UAT Neon `br-noisy-sun-az5krbgi`, Cloudflare dummy Turnstile keys, n8n webhook disabled.
- UAT Neon (supervisor, read-only): `landmarketthai_owner` owns `public_write_rate_limits` and `consume_rate_limit`, and the Preview app connects as that role. UAT still has the **pre-fix** function (no `skip locked`); the patched migration must be re-applied on an isolated UAT child branch, then on UAT itself (checklist Phase A).
- Still BLOCKED: real DO Spaces upload to a test bucket; real n8n event to a test sink.
- **Not given:** business approval for Kabin 101 rai (verified → pending, green zoning) and explicit production release approval. Nothing in this report is production approval.
- Release order is the phased sequence in [INTEGRATION_RELEASE_CHECKLIST_20261009.md](INTEGRATION_RELEASE_CHECKLIST_20261009.md): isolated rehearsal → Preview UAT → owner authorization → snapshot + read-only preflight → schema → app, with `HUMAN_VERIFICATION_REQUIRED=true` from the first production release.

## 1. What changed in this commit

| Change | Severity | Why | Test |
|---|---|---|---|
| `db/migrations/20261009_public_write_rate_limits.sql`: cleanup subselect `for update skip locked` | P3 (found by reviewer B, **reproduced**) | Real deadlock on PG18: call A holds the global `'*'` row and its 2% cleanup waits on an expired client row that call B is re-using; B waits for `'*'`. PostgreSQL aborts one call with `deadlock detected`; the app then falls back to the per-instance limiter for that request. Reproduced with the **real** pre-fix function (forced cleanup path via `setseed`): `ERROR: deadlock detected`. Patched function: returns `0`, no error. | `rate-limit.test.ts` migration contract asserts the clause; manual two-session repro recorded below |
| `src/lib/storage/provider.ts`: object-key extension derived from the allow-listed MIME type, not the client file name | P3 hardening (reviewer A, suspected) | `file_name: "a./../../evil.html"` produced a key `…/<uuid>./../../evil.html` (contains `/` and `..`). Not shown exploitable (presigned URL signature breaks if a client normalises the path; S3 keys are literal), but the key now never carries client text. | `src/lib/storage-provider.test.ts` (fails on pre-fix code, passes after); E2E check 10 |
| `src/lib/admin-zoning-route.test.ts` (new) | test gap | No test executed the real `PATCH /api/admin/zoning/[id]` handler. Now: 401 no session; 403 non-admin; 403 foreign `Origin`; 403 `sec-fetch-site: cross-site`; 0 DB writes for all of those; stale `expected_updated_at` → 409 without revalidation; current → 200 + revalidate; bad id / extra field / `document_verified` without evidence → 400; DB error → generic 500 (no SQL text). Mutation check: removing `!isAdminUserAllowed(user) \|\|` from the route makes it fail. | itself |
| `docs/security/PUBLIC_WRITE_HARDENING.md` | doc | Draft create row said "Human check: none" (stale since P1 #2). Verify SQL deleted the live `leads` global `'*'` row (would reset the production counter): now uses throwaway bucket `release_verify`. Added the app-role ownership check (see §4) and the fact that unsetting `HUMAN_VERIFICATION_REQUIRED` does **not** turn off draft-create verification on Vercel Production. | — |
| `scripts/release-rehearsal-full-chain.sql`, `scripts/uat-local-e2e.mjs`, `scripts/uat-local-preload.mjs` (new) | evidence | Reproducible local rehearsal and black-box E2E (disposable DB only; header comments say so). | — |

## 2. Gates (final, after the changes; Node v24.16.0, Next 15.5.24)

| Check | Result |
|---|---|
| `npm test` | **308 pass / 0 fail** (305 at `6c21346` + 3 new; 1 extended) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` (no `DATABASE_URL`, synthetic cookie secret, loopback auth URL, Cloudflare dummy site key) | exit 0, 38/38 static pages, Middleware 74.5 kB. First attempt failed once inside `next/font` Google download (`Cannot read properties of null (reading '1')`), retry passed: network flake, not code. |
| Baseline at `6c21346` before any edit | 305/305, lint 0, tsc 0 |

## 3. Local full-stack E2E (`node scripts/uat-local-e2e.mjs`) — 16/16 PASS

Setup: `next start` (production build) on 127.0.0.1:3207 → `@neondatabase/serverless` HTTP → `local-neon-http-proxy`
container → disposable PG18 DB `e2e` (full schema chain + both release migrations + 2 synthetic flagship rows).
Env: `VERCEL_ENV=preview`, `HUMAN_VERIFICATION_REQUIRED=true`, Cloudflare dummy secret, `N8N_WEBHOOK_LEADS=https://n8n-sink.invalid/uat`,
`DO_SPACES_ENDPOINT=https://sgp1.storage.invalid`, `NEON_AUTH_BASE_URL=http://127.0.0.1:9/uat-no-auth` (dead on purpose).
`scripts/uat-local-preload.mjs` replaces `fetch` in the server: Neon calls go to the local proxy; Siteverify is faked
(tokens `uat-pass-*` succeed **once**, like Cloudflare); n8n is recorded, never sent; **any other host is blocked and recorded**.

| # | Check | Result |
|---|---|---|
| 1 | `/ /land /search /sell /buy-request /become-partner /contact /property/101-rai-kabin-buri /property/37-rai-eec-rayong /sitemap.xml /robots.txt` 200; legacy `/submit-land` 308 → `/sell`; sitemap lists Kabin | PASS |
| 2 | Viewing `/sell` twice creates no draft row | PASS |
| 3 | `POST /api/leads` without token: 403, no row, no n8n event | PASS |
| 4 | buyer / partner / owner leads with token: 200, body only `{ok,id}`, DB row each, exactly one n8n event each with keys `{lead_id, lead_type, name}` only (no phone) | PASS |
| 5 | Same Turnstile token replayed: 403 | PASS |
| 6 | Buyer requirement: tokenless 403; with token 201 `pending_review`, `matches.full/near` arrays, no private keys in response; row saved | PASS |
| 7 | Seller draft create: tokenless 403, forged 403, **0 limiter rows** (human check before quota); token → 201 `{id, token}`, exactly +1 row; DB limiter wrote client + global row (not degraded fallback) | PASS |
| 8 | Draft GET without token 401, wrong token 404; PATCH without token 400, wrong token 404; with token 200 and round-trips | PASS |
| 9 | Seller PATCH with `document_verified` zoning: 400, stored zoning stays `owner_reported` | PASS |
| 10 | Upload presign: wrong token 404; PDF as image 400; valid → key `submissions/<draft>/images/<uuid>.png` (hostile name ignored), URL host `*.invalid`; confirm with no object 409; confirm with another draft's key 400; **0 media rows** | PASS |
| 11 | Draft submit: tokenless 403; with token 200 and status leaves `draft`; resubmit refused (404/409); PATCH after submit 404 | PASS |
| 12 | Draft create from one IP: 10 × 201 then 429 (`Retry-After`); a different IP still 201 | PASS |
| 13 | `/api/admin/leads`, `/api/admin/property-submissions` 401; `PATCH /api/admin/zoning/<kabin>` 401; forged session cookie 401; `/admin` 307 → `/login` | PASS |
| 14 | `/auth/callback?next=` `%2F%5Cevil.example`, `%2F%2Fevil.example`, `https%3A%2F%2Fevil.example` → `/` | PASS |
| 15 | No synthetic phone, draft token, seller name, draft title or requirement name in `/ /land /search /property/* /buyer-demand /sitemap.xml` or `/api/properties/search`; search JSON has no private keys | PASS |
| 16 | Zero blocked egress; n8n sink got exactly 3 events; Siteverify only via fake | PASS |

End state of `e2e`: leads 5 (3 lead forms + 1 buyer requirement + 1 submitted draft), buyer_requirements 1,
property_submissions 12, submission media 0, limiter rows 19. Server log: only the expected `[neon-auth] … NETWORK_ERROR host 127.0.0.1:9`
lines (auth upstream deliberately dead), no DB, limiter-fallback or unhandled errors.

Limits of this E2E (be precise when quoting it):
- Check 13's "forged cookie 401" holds because the auth upstream is unreachable (fail closed), not because a real Better Auth server rejected the cookie. Admin **403 for a real non-admin session** is covered by route tests (`admin-zoning-route.test.ts`, `operations-api.test.ts`, `admin-flow.test.ts`) with a stubbed session, not by a live login.
- **Partner lead in E2E went through the API, not the real form path.** `PartnerForm` uses the Server Action in `src/app/actions/leads.ts`; E2E posted `lead_type: partner` to `/api/leads`. The Server Action path is covered by `lead-actions.test.ts` only and still needs a real-browser Preview submit.
- Turnstile is faked at Siteverify; browser widget rendering is not exercised here (Preview Chrome UAT covered it earlier).
- DO Spaces: presign is signed offline; confirm proves "no object → no row". A real PUT/HEAD against a bucket was **not** done (no test bucket). BLOCKED for real-storage E2E.

## 4. Migration and rollback rehearsal (real PostgreSQL 18.6, disposable Docker only)

Schema built from scratch in order: stub `auth` schema/roles → `supabase/schema.sql` → `supabase/migrations/*` → `db/migrations/*`
(note: this local `lands.zoning` is `zoning_enum`; Neon's is `text` per `scripts/zoning-uat-fixture.sql`).

| Run | Result |
|---|---|
| `scripts/zoning-migration-test.sql` (fresh DB) | exit 0, "Zoning migration assertions passed" (the 2 ERROR lines are the intended Kabin-conflict abort inside its own transaction) |
| `scripts/zoning-rollback-test.sql` (fresh DB) | exit 0, "Zoning rollback assertions passed" |
| `scripts/release-rehearsal-full-chain.sql` on a copy of the full chain with synthetic Kabin (verified, NULL zoning), EEC 37 (verified, purple), one pending land, two drafts | exit 0, "Full-chain release rehearsal passed" |

Full-chain steps, all asserted: real `zoning-preflight.sql` in a read-only session (no STOP; one REVIEW: existing trigger
`lands.clear_changed_property_verification` — expected, confirm the same on Neon) → migration → `zoning-postflight.sql`
(no FAIL; one explained REVIEW: Kabin owner source) → Kabin = green / owner_reported / pending, other lands and all
submissions byte-identical (md5 of full rows) → migration rerun: no change → lossy legacy edit raises `LZ409` →
`zoning-rollback.sql` twice: data and `zoning_info` column kept, triggers gone → migration reapplied: 2 triggers back,
data unchanged → rate-limit migration rerun → no privileges for `anon`/`anonymous`/`authenticated` → per-client limit,
global limit, denied client does not burn global quota, invalid bucket denied.

**Owner gate found:** a role that does not own `public_write_rate_limits` gets `permission denied` (function is not
`SECURITY DEFINER`, nothing granted). The app catches it and silently uses the weak per-instance fallback. The
migration must be applied by (or grant to) the exact role in the app's `DATABASE_URL`; the check query is now in
`PUBLIC_WRITE_HARDENING.md` Step 1. Preview evidence (seller draft quota behaviour) does not prove this, because the fallback also limits.

Not done on Neon: a disposable child branch of `br-noisy-sun-az5krbgi` was **not** created (no Neon CLI/API access in
this session). The rehearsal above is real SQL on PG18.6 but not Neon's catalog, roles or pooler. BLOCKED: Neon-branch rehearsal of the patched rate-limit function and the rollback.

Deadlock repro (two real sessions, PG18): session B updates an expired client row and holds it 2 s, then touches `'*'`;
session A calls `consume_rate_limit` with the cleanup branch forced. Pre-fix function: A `ERROR: deadlock detected`.
Patched: A returns `0`, B commits. Same result with the extracted DELETE statement.

## 5. Reviews (read-only Sonnet 5.5 subagents, no writes)

A — API/UAT: no P0/P1. Fixed: storage-key extension. Confirmed, **not fixed (owner/product decisions, no feature creep)**:
- P2: buyer requirements and seller submissions create lead rows but **never notify n8n** (only `/api/leads` and the lead Server Actions do). Confirmed live: 5 lead rows, 3 n8n events. These leads are visible only in the admin queue.
- P2: no cap on media count per draft / per lead (only per-IP and global upload rate limits); `/api/uploads/confirm` can attach the same key twice.
- P3: webhook failure logs the n8n response body.

B — rollout: no P0. Fixed: cleanup deadlock, stale/unsafe doc lines. Confirmed, not fixed:
- P1 (process): Preview must use a Neon **non-production** branch, a **non-production** n8n URL and a **test** bucket. Now checklist Phase B step 5. The current Preview already does (per supervisor: `br-noisy-sun-az5krbgi`, n8n webhook disabled); re-check before any Preview UAT that uploads.
- P2: `NEON_AUTH_BASE_URL` unset falls back to the production auth endpoint (`src/lib/auth/server.ts`) with no `VERCEL_ENV` guard. Already listed as accepted; owner must confirm Preview sets it.
- P2: strict draft-create verification has no env-only kill switch on Production (documented now).
- P2: trigger forces `verification_status = 'pending'` whenever `zoning_info` changes, overriding a same-statement admin `verified` (by design; admins re-verify after a zoning change).
- P3: preflight check 40 (`pg_stat_activity`) can PASS without seeing other roles; the 5 s `lock_timeout` is the real guard. Preflight has no `has_schema_privilege(current_user,'public','CREATE')` check; no preflight exists for the rate-limit migration (the ownership query in §4 covers its main risk).
- P3: `HUMAN_VERIFICATION_REQUIRED` must be exactly `true`.

Old production app (`main`) after both migrations: rate-limit objects are unused by it; zoning column is nullable,
no default, no rewrite. Per earlier evidence the old handler returns HTTP 500 (not 409) for a lossy legacy zoning edit
and Kabin shows pending once migrated. Schema-before-app order stands within checklist Phase E (only after rehearsal, UAT and owner authorization). Not executed here: old SHA against a migrated DB.

## 6. Prior evidence relied on, not re-tested here

From the supervising assistant (Chrome, Preview at `6c21346`): public pages HTTP 200; seller first edit created
exactly one draft; tokenless POST 403 with no quota; **admin Google OAuth success**; two-tab concurrent zoning PATCH →
409, test field restored; owner_reported green/pending shown. I did **not** independently test a real Google session,
a real non-admin account, or the Preview deployment (Vercel API returned 403 for this team scope; no Vercel CLI).

## 7. Blockers requiring owner (Production NO-GO until all closed)

In release-phase order (checklist phases A–E). Items 1–5 touch non-production only; nothing in production may change before item 6.

1. **Phase A:** on a disposable child branch of UAT `br-noisy-sun-az5krbgi`, as `landmarketthai_owner`: zoning preflight → migration → postflight → re-apply the patched rate-limit migration → Step 1 verify (`release_verify` bucket only) → zoning rollback rehearsal. 100% pass. Then re-apply the patched rate-limit migration on UAT itself.
2. **Phase B:** supervising assistant reviews this commit, pushes; Preview redeploy of the reviewed SHA (Preview env stays UAT DB, dummy Turnstile, n8n disabled / test sink, test bucket) and combined browser UAT, including a real-browser PartnerForm (Server Action) submit.
3. Real DO Spaces upload + confirm against a **test** bucket and one real n8n notification to a **test** workflow. BLOCKED (no test bucket/sink); pass or explicit owner waiver.
4. Vercel env confirmation (I could not read it): Preview `NEON_AUTH_BASE_URL` = UAT branch auth; Production `N8N_WEBHOOK_LEADS`, `DO_SPACES_*`, `ADMIN_EMAILS`, `NEON_AUTH_COOKIE_SECRET` (≥32), `TURNSTILE_EXPECTED_HOSTNAMES` (apex and `www` if both serve) set; "Automatically expose System Environment Variables" ON.
5. Owner decisions: should buyer requirements and seller submissions notify n8n (P2 gap above)? Should `leads` / `buyer_requirements` become `human: "strict"` (not needed if the flag is on from the first release, below)?
6. **Phase C (gate):** business-owner approval of Kabin Buri 101 rai verified → pending with green zoning, and **explicit production release permission**. Neither given as of this report.
7. **Phase D:** Neon restore point of production `br-solitary-mud-az74nksn` recorded (ID + timestamp); read-only zoning preflight; confirm the production app's `DATABASE_URL` role.
8. **Phase E:** apply both migrations **as that role** (Step 1 ownership check as that role; verify only with the `release_verify` bucket, never delete live `leads` or `'*'` rows), then deploy the app. Production must have real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (already in Vercel Production env, not yet built into a deployment) and `HUMAN_VERIFICATION_REQUIRED=true` **before** the first production build, so leads and buyer requirements are never tokenless (quota-exhaustion lockout) in production.

Rollback facts (match the code): unsetting `HUMAN_VERIFICATION_REQUIRED` only disables verification for leads, buyer requirements, lead Server Actions and draft submit. Seller draft create stays verified on Vercel Production regardless; if Turnstile config is broken, fix keys + redeploy or promote the previous known-good deployment. Siteverify down or secret missing = 503 on every verified route (fail closed).

## 8. Residual risk (accepted unless owner says otherwise)

- Turnstile solver farms on many IPs can still use verified quota (500 drafts/h global).
- Global ceilings let one well-resourced attacker 429 a route for everyone where human check is off.
- Limiter falls back to per-instance limits on any DB error, logged at most once a minute — monitor `[rate-limit] database limiter unavailable` after launch.
- Uploaded file content is not scanned; per-draft media count is unbounded.
- Neon-specific behaviour (roles, pooler, PG18 catalog differences, `text` vs enum `zoning`) is covered by the earlier Neon UAT runs, not by this local rehearsal.

## 9. How to reproduce (disposable only)

```bash
docker run -d --name lmt-uat-pg18 -e POSTGRES_PASSWORD=uat_local_only -e POSTGRES_DB=landmarketthai -p 127.0.0.1:55441:5432 postgres:18
# create auth stub schema + roles anon/authenticated/anonymous/service_role, then apply in order:
#   supabase/schema.sql, supabase/migrations/*.sql, db/migrations/*.sql
# rehearsal (run from scripts/ inside the container, on a copy DB):
psql -X -v ON_ERROR_STOP=1 -f release-rehearsal-full-chain.sql
# E2E: DB "e2e" = copy + 2 synthetic lands + both release migrations, then
docker run -d --name lmt-uat-neonproxy --network <net with pg> -p 127.0.0.1:4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:uat_local_only@lmt-uat-pg18:5432/e2e ghcr.io/timowilhelm/local-neon-http-proxy:main
npm run build && node scripts/uat-local-e2e.mjs
```

The containers, network and temp logs used for this report were removed after the run; they held synthetic data only.
