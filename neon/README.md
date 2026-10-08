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

## Zoning data (prepared, not applied to production)

`migrations/202610080001_zoning_info.sql` adds nullable `zoning_info` JSONB to `lands` and `property_submissions`. It expects the existing `zoning`, `slug`, `verification_status`, `updated_at`, `deleted_at` and `property_submissions.linked_land_id` columns (confirmed read-only on Neon 2026-10-08). No new database, public write API or automatic zoning lookup is introduced.

- `zones`: up to 20 entries with nullable `color`, optional `type_code`, and optional `type_name`.
- `status`: `unknown`, `owner_reported`, `map_checked`, or `document_verified`.
- `plan_name`, `source`, `checked_at` (ISO calendar date), and `evidence_url` (public HTTP/S link). Missing text stays empty; nothing infers a type code or plan name from color.
- Map/document statuses require source, check date and evidence link. Sellers can only send `unknown` or `owner_reported`; only `/manage/zoning` (server-side admin check) can record map/document statuses.

Zoning is optional: a listing publishes with `zoning_info` NULL or empty and reads “ยังไม่ระบุผังเมือง”. The shared reader in `src/lib/zoning.ts` supplies cards, detail, search, matching, analytics and metadata. Legacy rows with only the single `zoning` color show that color with status “ยังไม่ทราบ” (no reporter is claimed), and a Verified listing review never implies verified zoning. A trigger copies the first structured color into the legacy column, rejects legacy-only color edits, and resets `verification_status` to `pending` whenever `zoning_info` changes.

The migration does not backfill. Its only data change is the Kabin Buri correction (green, owner reported, source “พี่ไกรแจ้ง ยังไม่มีหลักฐานทางการ”, other fields empty); because it changes `zoning_info`, that listing's `verification_status` becomes `pending`. It aborts if Kabin Buri already has a different `zoning_info` or any legacy `zoning` color. Deploy the app together with the migration: the old seller form edits only the legacy column, which the trigger rejects.

Validation (disposable local PostgreSQL only, never production):

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
psql -v ON_ERROR_STOP=1 -d <disposable_database> -f scripts/zoning-migration-test.sql
# UAT: fresh database named zoning_uat_*, on 127.0.0.1:55438 user zoning_test
psql -v ON_ERROR_STOP=1 -d zoning_uat_run -f scripts/zoning-uat-fixture.sql
ZONING_TEST_DATABASE=zoning_uat_run node --import ./scripts/register-ts-paths.mjs --experimental-strip-types scripts/zoning-uat.mjs
```

`scripts/zoning-preflight.sql` is the read-only production catalog check (run with `PGOPTIONS='-c default_transaction_read_only=on'`).
