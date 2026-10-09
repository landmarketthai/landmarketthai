# Zoning release rehearsal — 2026-10-09

**PASS: local verification. BLOCKED: release authorization/readiness pending host PostgreSQL 18 and real OAuth evidence.**

Scope: `C:\GitHub\landmarketthai`, branch `codex/zoning-review`, HEAD `e6c1b4ab73cec4186c0d1949324e837547f025a3`. Three Codex subagents audited migration/compatibility, auth/privacy, and release/recovery read-only. Corrections are uncommitted. No production SQL writes/DDL, merge, deploy, restore, Git push, or credential retrieval occurred. Original untracked `.claude/` and `neon/review/` were not read or edited.

## Coordinating host follow-up — Neon PostgreSQL 18.6 (same day, after the agent session)

The coordinating host independently used the connected Neon API with **explicit branch IDs**, not the Codex CLI's unavailable Neon approval flow. These observations supersede the original UAT first-run instructions for the named branch below. They do **not** authorize production rollout.

- **Production branch `br-solitary-mud-az74nksn` — read-only preflight:** all required PASS checks passed, `zoning_info` absent on both tables; counts `lands=3`, `live=3`, `legacy_zoning_lands=2`, `submissions=5`, `legacy_zoning_submissions=0`; `verified=3`, `pending=0`. No production write occurred.
- **UAT branch `br-curly-unit-az63t9wv` (Neon PostgreSQL 18.6) — real first-run preflight:** all mandatory PASS checks passed, identical counts, and exactly one live Kabin Buri with `zoning=NULL`, `zoning_info` absent and `verification_status=verified`.
- **UAT first-run migration:** 16 SQL statements were executed in one Neon-API transaction on this UAT branch only. Postflight had no FAIL; six mandatory PASS checks and one explained REVIEW for owner-reported Kabin source. `legacy_zoning_lands` rose **2→3**; `verified` **3→2**; `pending` **0→1**. Kabin became `green/owner_reported/pending`.
- **UAT SQL compatibility:** a rollback-safe DO assertion confirmed SQLSTATE `LZ409` on a lossy legacy edit and conversion of a lossless legacy edit into unknown structured zoning. This does **not** prove the Neon JavaScript driver or HTTP handler returns 409.
- **UAT idempotence:** re-running all 16 migration statements left the Kabin full-row hash `cacb8abeb7305116c066231e9a41ccd3` unchanged.
- **UAT rollback/reapply rehearsal:** dropping constraints/triggers/functions, checking preserved structured data, and reapplying the migration happened inside one transaction (26 statements). Both triggers were restored, and all hashes remained unchanged.
- **UAT unaffected-row hashes**, normalized to remove the newly added `zoning_info` column: other lands `76ffc3bae01ff36f4fafcd4351b571f3`; property submissions `511912759fdfc4abd77d7f3b562292ca` before and after all tests.
- **Current UAT branch state is POST-migration.** The original zero-column baseline in the first-run guide below is historical and must **not** be required when rechecking this branch. For a truly fresh first-run UAT, create another disposable branch from production; do not reset UAT/Production or treat a partial schema as a successful rollout.
- **Outstanding release blockers:** real Google OAuth/admin browser test, Vercel preview/live HTTP smoke, JavaScript Neon driver `LZ409→409` mapping, operator rollback-point confirmation and production deployment gate. Production remains unmodified.

## Executed evidence

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| Branch/HEAD | PASS | Expected branch and exact SHA confirmed; no commit made. |
| `npm test` | PASS | 250 passed, 0 failed, 0 skipped. Includes direct/nested `LZ409` mapping, microsecond concurrency, seller status validation and privacy. |
| `npm run lint` | PASS | Exit 0. |
| `npx tsc --noEmit` | PASS | Exit 0. |
| `npm run build` | PASS | Next.js 15.5.24, exit 0, 38 static pages generated. No `DATABASE_URL`; synthetic local-only cookie secret and unused loopback Auth URL. Does not establish Neon/OAuth behavior. |
| SQL migration assertions | PASS | `scripts/zoning-migration-test.sql`, exit 0 on disposable PostgreSQL **17.10**. First run/reruns, validation, both-table lossless conversion and `LZ409`, admin-reviewed/color-cleared reruns, exact deltas and unrelated-change controls. Final conflicting-Kabin ERROR/transaction rollback is intentional and followed by passing assertions. |
| Actual first-run preflight/postflight | PASS | Production-shaped synthetic fixture before columns exist: no STOP; one NULL/verified Kabin. After migration: all mandatory postflight checks PASS, one explained owner-source REVIEW; legacy-land count 1→2, verified 2→1, pending 0→1. |
| SQL recovery assertions | PASS | `scripts/zoning-rollback-test.sql`, exit 0; data retention, rollback twice, guards removed, drift reconciled, migration reapplied. |
| Local route/SQL UAT | PASS | `scripts/zoning-uat.mjs`, **14 checks**, exit 0 against `zoning_uat_rehearsal`. Real application SQL/handlers and rendering; server session retrieval is stubbed. Includes new actual-preflight NULL regression. |
| Smoke assertion self-test | PASS | 19 fixtures; no network/OAuth. |
| Host SQL examples | PASS locally | All five SQL blocks in this package executed successfully on the disposable PG17 fixture. This verifies SQL syntax/test assertions, not Neon PG18, branch identity, or effective runtime grants. |
| Production live smoke | BLOCKED | All four direct Node fetches failed at network fetch. No HTTP status/content assertions passed. Web reader returned cached public home/detail content (crawled yesterday); this is not live smoke or release evidence. |
| Neon SQL / production preflight | BLOCKED | `neon_run_sql` returned “MCP tool call requires approval, but approval policy is never.” No SQL executed through that tool. No privileged connection obtained or assumed. |
| Google OAuth/admin browser | BLOCKED | No real auth credentials or browser save. Metadata/route tests are not live OAuth. |
| Local build/start HTTP | BLOCKED | Build passed; the runtime command was rejected by command policy. No local HTTP smoke claimed. |

Local SQL/UAT logs remain in ignored `.partner-check/zoning-rehearsal-20261009/`: `migration.log`, `rollback.log`, `fixture.log`, `preflight-first.log`, `uat.log`. The disposable server was stopped; it listened only on `127.0.0.1:55438`. Node reported existing module-type warnings; no dependency changes were made.

## Minimal corrections

- Preflight recognizes absent `zoning_info` and existing SQL NULL equivalently; submission snapshots now correctly report SQL NULL facts as absent. The regression executes the actual preflight SQL and rolls back its synthetic NULL setup.
- Pre/postflight command examples use `-X -v ON_ERROR_STOP=1`; the runbook requires explicit branch identity and direct/unpooled operator connections without credential-bearing command arguments.
- `.env.local.example` documents the actual `NEON_AUTH_BASE_URL`, required cookie secret, and verified admin email allowlist. The obsolete public Auth variable was ignored and could leave UAT using the server's production fallback.
- The runbook distinguishes current HTTP 409 handling from old handlers' possible HTTP 500, explains deliberate admin publication of provenance, and requires drift reconciliation before forward recovery.

No migration or application behavior was otherwise changed.

## Confirmed read-only control-plane observations

These were retrieved during this rehearsal; recheck before host execution because endpoint/configuration mappings can change.

| Item | Observation |
| --- | --- |
| Neon project | `dry-hill-07009531` |
| Authorized UAT | `br-curly-unit-az63t9wv`, `zoning-release-uat-20261009`, ready, nondefault |
| UAT parent / production | `br-solitary-mud-az74nksn`, named `production`, default |
| UAT database / catalog owner | `landmarketthai` / `landmarketthai_owner` (catalog observation, not a credential or assertion of operator privilege) |
| UAT direct endpoint | `ep-fragrant-breeze-az6y88y2.c-3.ap-southeast-1.aws.neon.tech` |
| UAT Auth | Managed Better Auth, branch-bound base URL `https://ep-fragrant-breeze-az6y88y2.neonauth.c-3.ap-southeast-1.aws.neon.tech/landmarketthai/auth` |
| UAT OAuth provider | Google, type `shared` |
| UAT trusted local origins | `http://localhost:3101`, `http://localhost:3102`; production-style domains are also inherited/listed. `127.0.0.1` is a different origin. |
| Production direct endpoint | `ep-raspy-credit-aztfc03r.c-3.ap-southeast-1.aws.neon.tech` — read-only preflight only in this task |
| Vercel project / team | `prj_xCFIVfdJloEza76QmmEYotafCFne` / `team_f240D2rDbl2cx6m4mArDo0n7` |
| Latest listed READY production candidate | `dpl_Hf4c43eiFEGCd9XsPSZpkXcxz4ZH`, SHA `3d49c2b147947745cdc6b73f09c8beebfc319c53`, main, rollback candidate; URL `landmarketthai-ivay0kv04-landmarketthai.vercel.app` |

The deployment list does not prove the domain's current alias or database/Auth environment mapping. Host must confirm those separately. Inspection of that SHA's draft PATCH shows a generic HTTP 500 catch, so do not promise old-deployment `LZ409 → HTTP 409`.

## Coordinating host: exact connection and first-run actions

Only the host's existing permitted credentials may be used. Confirm branch ID→endpoint in Neon before configuring libpq. PostgreSQL `current_database()` alone cannot identify a Neon branch. Use the direct hostname (no `-pooler`) for these session-based scripts; see [Neon guidance on session state and direct connections](https://neon.com/blog/inside-lubots-database-per-tenant-architecture).

Use separate operator connection configurations for UAT and production. Keep passwords in an operator-managed `PGPASSFILE`/service configuration; do not put a credential URI in command arguments or saved output. For UAT in PowerShell, after host configures its permitted `PGUSER` and password file:

```powershell
Set-Location C:\GitHub\landmarketthai
$env:PGHOST = 'ep-fragrant-breeze-az6y88y2.c-3.ap-southeast-1.aws.neon.tech'
$env:PGPORT = '5432'
$env:PGDATABASE = 'landmarketthai'
$env:PGSSLMODE = 'require'
$env:PGCLIENTENCODING = 'UTF8'
$env:PGOPTIONS = '-c default_transaction_read_only=on'
psql -X -v ON_ERROR_STOP=1 -f scripts/zoning-preflight.sql
```

Save output privately; treat a SQL error/nonzero exit as BLOCKED, any STOP as BLOCKED, and record a decision for every REVIEW. The supplied initial PostgreSQL 18/zero-column/NULL-verified state has **not** been independently confirmed by SQL in this session. Run these read-only queries before applying anything:

```sql
SELECT current_database(), current_user, current_setting('server_version'),
       current_setting('default_transaction_read_only');
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('lands','property_submissions')
  AND column_name = 'zoning_info';
SELECT id, slug, status, zoning::text, verification_status, updated_at,
       to_jsonb(l)->'zoning_info' AS zoning_info
FROM public.lands l
WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL;
```

Required initial result: PostgreSQL 18, database `landmarketthai`, read-only on, **zero** matching columns, **one** live Kabin, legacy zoning NULL and verification `verified`. Capture all preflight counts and the catalog snapshot. If state differs, stop and reconcile rather than accepting the old assumptions.

For precise row comparisons, save the following JSON privately **before** migration, immediately **after** the first migration, and after the rerun. It normalizes an absent column to JSON null and avoids exporting submission contact fields. Compare by table/ID, including additions/deletions:

```sql
SELECT jsonb_build_object(
  'lands', (SELECT jsonb_agg(jsonb_build_object(
    'id', l.id, 'slug', l.slug, 'status', l.status, 'deleted_at', l.deleted_at,
    'zoning', l.zoning, 'zoning_info', to_jsonb(l)->'zoning_info',
    'verification_status', l.verification_status, 'updated_at', l.updated_at)
    ORDER BY l.id) FROM public.lands l),
  'submissions', (SELECT jsonb_agg(jsonb_build_object(
    'id', s.id, 'status', s.status, 'linked_land_id', s.linked_land_id,
    'zoning', s.zoning, 'zoning_info', to_jsonb(s)->'zoning_info',
    'verification_status', s.verification_status, 'updated_at', s.updated_at)
    ORDER BY s.id) FROM public.property_submissions s)
) AS private_zoning_baseline;
```

Do not run the disposable schema/test fixture files on Neon: they create synthetic schema for an empty local database. Quiesce UAT application writes during baseline/apply/comparison so concurrent changes cannot be attributed to migration.

After preflight is accepted, **only on the UAT connection above**:

```powershell
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
psql -X -v ON_ERROR_STOP=1 -f neon/migrations/202610080001_zoning_info.sql
# Inspect the exit code before continuing. On failure, rerun read-only preflight;
# it must prove the original schema/data remain. Do not blindly retry.
$env:PGOPTIONS = '-c default_transaction_read_only=on'
psql -X -v ON_ERROR_STOP=1 -f scripts/zoning-postflight.sql
```

Expected first-run comparisons: two JSONB columns, two validated CHECKs, two enabled BEFORE row triggers, validator/sync functions, no invalid rows; legacy-land nonnull count **exactly +1**, verified **−1**, pending **+1**. All land/live/submission counts and submission legacy-zoning count stay equal. Only live Kabin's zoning, zoning_info, verification and updated timestamp change. It becomes green/owner_reported with source from the migration and no invented plan/date/type/evidence. Postflight's one source/evidence REVIEW must be confirmed as that Kabin source, not another row.

Then capture a fresh baseline, run read-only preflight, accept the expected rerun REVIEWs only after object/data inspection, rerun the migration on **UAT**, and run postflight again. Require **exact zero** row/count/verification/timestamp delta against this new baseline. Existing admin-reviewed/cleared-color facts must stay intact. +0/+1 is never a tolerance.

Postflight directly references new functions/columns; an incomplete schema may raise SQL errors instead of a FAIL row. That is BLOCKED. Both preflight statements are informational checks, not an automatic migration permission gate.

The parallel security audit should reconcile runtime privileges; this session did not query them. Capture this read-only observation on UAT and, if permitted, production before/after migration. The documented anonymous Data API boundary requires no direct table privileges; unexpected grants are a release blocker, not something this rehearsal may change:

```sql
SELECT r.rolname, c.relname, p.privilege,
       has_table_privilege(r.oid, c.oid, p.privilege) AS allowed,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
WHERE r.rolname IN ('anonymous','authenticated') AND n.nspname = 'public'
  AND c.relname IN ('lands','property_submissions')
ORDER BY r.rolname, c.relname, p.privilege;
```

If a role is absent, the query returns no rows for it; absence is not proof that every Data API identity is restricted. Host must verify the actual configured roles and effective grants/policies with the security team.

## Coordinating host: real PG18 `LZ409` and HTTP checks

After successful first-run migration, this UAT-only transaction must raise/catch `LZ409` and preserve the entire Kabin row. It rolls back even the test transaction. Save the assertion result, not private row contents:

```sql
BEGIN;
DO $$
DECLARE before_row jsonb; got text;
BEGIN
  SELECT to_jsonb(l) INTO STRICT before_row FROM public.lands l
  WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL;
  BEGIN
    UPDATE public.lands SET zoning = 'purple'
    WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL;
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE;
  END;
  ASSERT got = 'LZ409', 'expected LZ409';
  ASSERT (SELECT to_jsonb(l) = before_row FROM public.lands l
    WHERE slug = '101-rai-kabin-buri' AND deleted_at IS NULL), 'row changed';
END $$;
ROLLBACK;
```

Separately run the **current local app** against UAT (no deploy): explicitly set UAT `DATABASE_URL`, the UAT `NEON_AUTH_BASE_URL` above, an independent >=32-character cookie secret, `ADMIN_EMAILS` for a verified test account, and `NEXT_PUBLIC_SITE_URL=http://localhost:3102`. Avoid production webhook/storage credentials. Start with `npm run start -- --hostname localhost --port 3102` after a correctly configured build. The local SQL harness must stay on loopback with stubbed auth; it must not be repointed to Neon.

Using this UAT app only, POST `/api/property-submissions` to create a synthetic draft (201, ID and token). PATCH `/api/property-submissions/<id>` with that token and:

```json
{"token":"<private draft token>","zoning_info":{"zones":[{"color":"green","type_code":"","type_name":""},{"color":"yellow","type_code":"","type_name":""}],"status":"owner_reported","plan_name":"","source":"UAT_PRIVATE_SOURCE_20261009","checked_at":"","evidence_url":"https://example.com/UAT_PRIVATE_EVIDENCE_20261009"}}
```

Require 200. GET the draft with header `x-draft-token`; save its synthetic facts privately. Next PATCH with `{"token":"<same token>","zoning":"purple"}` and **omit** zoning_info. Require **409**/reload guidance and exact unchanged stored facts/updated timestamp. This exercises the real Neon driver, trigger and route mapping; the SQL check alone cannot establish HTTP behavior. An older rollback handler may return 500 but must still preserve facts.

For real OAuth, use a private browser at the exact trusted `http://localhost:3102` origin. Confirm the Google provider/callback works on the UAT Auth endpoint. No sign-in or credential provisioning was performed here. Check:

1. Anonymous editor redirects to login; anonymous admin PATCH returns 401. Signed-in verified nonadmin is denied and PATCH returns 403, without mutation.
2. Verified allowed Google admin signs in, returns to editor, reloads, saves synthetic zoning and gets 200; stored facts reload correctly and generic listing verification becomes pending.
3. Save in the first of two tabs; stale second save returns 409 with reload guidance and cannot overwrite. Foreign Origin returns 403. Invalid body/ID returns 400.
4. Publish synthetic submissions with zoning omitted, left empty, and multicolor owner-reported zoning. Before admin applies provenance, known owner source/evidence markers must be absent from public cards, detail HTML/RSC, description/OG/Twitter and search JSON. The linked submission retains its original.
5. Both green/yellow search filters return the synthetic multicolor listing. Detail/card/metadata display the same persisted facts and no invented zoning type or verified zoning claim.
6. Admin deliberately applies/reviews public synthetic evidence; only then may those references appear publicly. Owner original remains unchanged. Record status/assertion evidence without cookies, tokens, OAuth query secrets or private owner provenance.

For read-only smoke, set `BASE_URL=http://localhost:3102`, the synthetic `SMOKE_SLUG`, and nonempty `SMOKE_FORBIDDEN_TEXT=UAT_PRIVATE_SOURCE_20261009|UAT_PRIVATE_EVIDENCE_20261009`, then run `node scripts/zoning-smoke.mjs`. Ensure that listing is in the five-row API sample or inspect its relevant filtered response separately. A smoke PASS does not test OAuth, exact color filters or deployment SHA.

## Coordinating host: rollback and production stop line

Local recovery assertions passed. Before any UAT guard rollback, save a fresh private data baseline. `scripts/zoning-rollback.sql` retains columns/data and removes triggers/CHECKs/functions; require identical data after first and second rollback. Reconcile invalid JSON and color drift before reapplication: restoring guards alone does not repair existing drift. After rollback, inspect both tables with this read-only query; any result or invalid/malformed JSON error requires reconciliation:

```sql
WITH facts AS (
  SELECT 'lands' AS table_name, id::text AS id, zoning::text AS legacy, zoning_info FROM public.lands
  UNION ALL
  SELECT 'property_submissions', id::text, zoning::text, zoning_info FROM public.property_submissions
)
SELECT f.table_name, f.id, f.legacy, d.color AS structured
FROM facts f LEFT JOIN LATERAL (
  SELECT z.value->>'color' AS color
  FROM jsonb_array_elements(f.zoning_info->'zones') WITH ORDINALITY AS z(value, ord)
  WHERE z.value->>'color' IS NOT NULL ORDER BY ord LIMIT 1
) d ON true
WHERE f.zoning_info IS NOT NULL AND f.legacy IS DISTINCT FROM d.color;
```

Run postflight/validator checks after forward reapplication. Keep rollback testing before OAuth/HTTP acceptance so the final UAT app sees intact guards.

Production remains **read-only** in this rehearsal. Host may select `br-solitary-mud-az74nksn` explicitly, use its direct permitted connection, set read-only PGOPTIONS, and run identity/preflight only. Do not reuse the UAT apply/rerun/test-write commands on production. Do not execute production migration/rollback/restore, merge, deploy or push.

Before any separately authorized release, host must record the current production domain alias/deployment SHA, exact candidate SHA (including reviewed corrections), DB/Auth mapping, a valid restore point, and the specific rollback deployment. App rollback leaves the migrated DB intact; old handlers may show 500 for safe rejection of lossy edits. Guard rollback permits drift; point-in-time restore can lose subsequent leads/submissions. No restore or Vercel rollback was rehearsed live here.

Skipped: live PG18 execution, production preflight, real OAuth, live HTTP acceptance, grant/lock/performance testing, and actual Vercel rollback. Risk: release stays BLOCKED until host evidence closes these gates; local PG17 and mocked sessions cannot establish production readiness.
