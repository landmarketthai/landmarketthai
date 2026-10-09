# Neon backend

LandmarketThai now uses Neon for the production PostgreSQL database and Managed Better Auth.

## Production

- Project: `LandmarketThai`
- Region: Singapore (`aws-ap-southeast-1`)
- Database: `landmarketthai`
- Branch: `production`
- Auth: Neon Managed Better Auth with Google OAuth

## App configuration

Server-side database access uses `DATABASE_URL`. Never expose this value with a `NEXT_PUBLIC_` prefix or commit it to Git.

Browser authentication uses the public Neon Auth endpoint. `NEXT_PUBLIC_NEON_AUTH_URL` is an optional override; the production endpoint is also defined in `src/lib/auth/client.ts` because it is not a credential.

Public and CRM database writes run server-side through `@neondatabase/serverless`. The Neon Data API is enabled, but the `anonymous` role has no direct table privileges, so application tables are not exposed for anonymous reads or writes through that API.

## Legacy Supabase

The former Supabase project was paused. Application source code no longer imports Supabase clients or relies on Supabase environment variables. The old `supabase/schema.sql` is retained only as historical migration reference and must not be treated as the current production schema.

## Zoning data (prepared, not applied to production; see the rollout runbook below)

`migrations/202610080001_zoning_info.sql` adds nullable `zoning_info` JSONB to `lands` and `property_submissions`. It expects the existing `zoning`, `slug`, `verification_status`, `updated_at`, `deleted_at` and `property_submissions.linked_land_id` columns (confirmed read-only on Neon 2026-10-08). No new database, public write API or automatic zoning lookup is introduced.

- `zones`: up to 20 entries with nullable `color`, optional `type_code`, and optional `type_name`.
- `status`: `unknown`, `owner_reported`, `map_checked`, or `document_verified`.
- `plan_name`, `source`, `checked_at` (ISO calendar date), and `evidence_url` (public HTTP/S link). Missing text stays empty; nothing infers a type code or plan name from color.
- Map/document statuses require source, check date and evidence link. Sellers can only send `unknown` or `owner_reported`; only `/manage/zoning` (server-side admin check) can record map/document statuses.

Zoning is optional: a listing publishes with `zoning_info` NULL or empty and reads “ยังไม่ระบุผังเมือง”. The shared reader in `src/lib/zoning.ts` supplies cards, detail, search, matching, analytics and metadata. Legacy rows with only the single `zoning` color show that color with status “ยังไม่ทราบ” (no reporter is claimed), and a Verified listing review never implies verified zoning. A trigger copies the first structured color into the legacy column, rejects legacy-only color edits, and resets `verification_status` to `pending` whenever `zoning_info` changes.

The migration does not backfill. Its only data change is the Kabin Buri correction (green, owner reported, source “พี่ไกรแจ้ง ยังไม่มีหลักฐานทางการ”, other fields empty); because it changes `zoning_info`, that listing's `verification_status` becomes `pending`. It aborts if Kabin Buri has a legacy `zoning` color without `zoning_info`, and skips (NOTICE) if it already has any `zoning_info`; it is re-runnable. Apply the migration before deploying the app (see runbook); old app code stays compatible because the trigger converts lossless legacy-only edits and rejects lossy ones with SQLSTATE `LZ409` (HTTP 409).

Validation (disposable local PostgreSQL only, never production):

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
psql -v ON_ERROR_STOP=1 -d <disposable_database> -f scripts/zoning-migration-test.sql  # exact postflight count deltas and unrelated-change rejection
# UAT: fresh database named zoning_uat_*, on 127.0.0.1:55438 user zoning_test
psql -v ON_ERROR_STOP=1 -d zoning_uat_run -f scripts/zoning-uat-fixture.sql
ZONING_TEST_DATABASE=zoning_uat_run node --import ./scripts/register-ts-paths.mjs --experimental-strip-types scripts/zoning-uat.mjs
```



## Zoning rollout runbook (migration first, app second)

Order matters. Migrated DB + old app = works (the trigger converts lossless legacy-only edits and returns SQLSTATE `LZ409`/HTTP 409 when structured data would be lost). New app + unmigrated DB = draft save/publish fails loudly (`column zoning_info does not exist`). So: migrate, verify, then deploy. Never deploy the app first.

All SQL below runs from the repo root with the production `DATABASE_URL` from your own shell, by an operator. Keep the output of each step.

0. **Restore point.** Create a Neon branch (or snapshot) of production and record its name/ID and timestamp. Do not continue without it.
1. **Preflight (read-only).** `PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -f scripts/zoning-preflight.sql`
   - **STOP** if any row is `STOP`: missing table/column, legacy `zoning` outside the allowed colors, Kabin Buri not exactly one live row or has legacy zoning without `zoning_info`, zoning names already taken by unrelated objects, a transaction older than 30 s holding locks on `lands`/`property_submissions`, or the role does not own the tables.
   - `REVIEW` rows (zoning_info already exists, Kabin Buri has a different `zoning_info`, other triggers) need a human decision. If zoning_info already exists, skip to step 3.
   - Note the `INFO` counts.
2. **Apply.** `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f neon/migrations/202610080001_zoning_info.sql`. It is one `BEGIN`/`COMMIT` with `lock_timeout 5s` / `statement_timeout 60s`; any error rolls everything back. After a failure rerun step 1: the result must equal the earlier run (no `zoning_info` column). Retry only after the cause is understood (usually a lock timeout: wait for the blocking transaction).
3. **Postflight (read-only).** `PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -f scripts/zoning-postflight.sql`. Required: no `FAIL` row (an SQL error also counts as FAIL). `REVIEW` rows need a person to look. Compare with the **saved preflight for this run**:
   - `lands`, `live`, `submissions`, and `legacy_zoning_submissions` must be identical.
   - On the initial correction, when the one live Kabin Buri row had both `zoning` and `zoning_info` NULL (or the column was absent), `legacy_zoning_lands` must increase by **exactly 1**: the trigger derives legacy `green` from the correction. Only that row may change; its `verification_status` becomes `pending`.
   - On a rerun or post-admin check where Kabin Buri already had any `zoning_info`, including the earlier correction or admin-reviewed data, `legacy_zoning_lands` must be **unchanged** against that run's preflight. This also applies if an admin cleared its zones and legacy zoning is now NULL. The migration preserves its data and verification status.
   - Choose the exact expected delta from the recorded preflight state; never accept either +0 or +1 as a tolerance or infer the baseline from postflight. Compare every other land's zoning and verification state with the saved preflight catalog snapshot as well: unrelated or offsetting changes are a failed comparison even when global counts match. If intervening writes occurred, reconcile them and capture a fresh baseline; do not attribute them to the correction.
4. **Deploy the app** (merge `develop` to `main` / Vercel production). The old app keeps working against the migrated DB until then.
5. **Smoke tests.** `BASE_URL=https://<domain> [SMOKE_SLUG=...] [SMOKE_FORBIDDEN_TEXT='owner source text|evidence url'] node scripts/zoning-smoke.mjs` (read-only GETs: home, listing detail, search API, unauthenticated `/manage/zoning`). Then, manually: an **authorised admin signs in with real Google OAuth and saves zoning** on `/manage/zoning`, publishes a draft with and without zoning, and confirms the public page shows no owner source/evidence. The smoke script cannot do this.
   - `node scripts/zoning-smoke.mjs --self-test` only checks the script's own assertions.

Passing local tests, the disposable-DB scripts or the smoke script is **not** production verification. Production is verified only by steps 1-3 on the real database plus the manual authenticated check in step 5.

### Recovery matrix

| Situation | Action |
| --- | --- |
| Migration failed (step 2) | Nothing was changed (single transaction). Rerun preflight to confirm, fix the cause, retry. Do not deploy. |
| Postflight failed (step 3) | Do not deploy. Stop writes if possible. Inspect the failing row. If the trigger/constraints misbehave, run `scripts/zoning-rollback.sql` (keeps all `zoning_info` data). If data is corrupt, use the Neon restore point (below). |
| App deploy failed or misbehaves (step 4/5) | Redeploy the previous Vercel deployment (Promote/Instant Rollback). Safe: the old app is compatible with the migrated DB. Leave the DB as is. |
| Trigger or CHECK rejects legitimate saves | `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/zoning-rollback.sql` (one transaction, idempotent, drops triggers/function/CHECKs; columns and data stay). Legacy `zoning` and `zoning_info` may then drift until a corrected migration is re-applied (the migration is re-runnable). Dropping the columns is a separate, commented-out, destructive step: export first. |
| Data issue found later | Fix the rows by an admin save in `/manage/zoning` or a reviewed UPDATE. Do not restore for a handful of rows. |
| Catastrophic corruption | Last resort: Neon point-in-time restore to the step-0 restore point. **Everything written after that point is lost** (new leads, submissions, edits): export what is needed from the current branch first, or restore into a new branch and copy rows back. |

Disposable-DB checks for these scripts (local PostgreSQL only, never production):

```bash
psql -v ON_ERROR_STOP=1 -d <empty_disposable_db> -f scripts/zoning-rollback-test.sql   # rollback keeps data, re-apply works
```
