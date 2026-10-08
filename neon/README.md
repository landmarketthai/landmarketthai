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

`migrations/202610080001_zoning_info.sql` extends `lands` with `zoning_info` JSONB. It expects the existing `zoning`, `slug`, `updated_at`, `deleted_at`, `verified_at`, and `verified_by` columns. Confirm these on a nonproduction schema before applying. No new database, public write API, or automatic zoning lookup is introduced.

- `zones`: up to 20 entries with nullable `color`, optional `type_code`, and optional `type_name`. Multiple entries can have the same color and different types.
- `status`: `unknown`, `owner_reported`, `map_checked`, or `document_verified`.
- `plan_name`, `source`, `checked_at` (ISO calendar date), and `evidence_url` (public HTTP/S link). Missing text stays empty; nothing infers a type code or plan name from color.
- Map/document statuses require source, check date, and evidence link. This validates recorded provenance; it does not verify the contents of a remote link or grant development permission.

The shared reader in `src/lib/zoning.ts` supplies cards, both detail routes, search, matching, analytics, and metadata. It accepts legacy single-color rows before migration. An explicitly empty structured record overrides a legacy color. A database trigger synchronizes the first known structured color into the legacy column and rejects legacy-only color edits that would discard structured facts. Update `zoning_info` for all future zoning edits.

Backfill labels existing colors as owner reported, without inventing evidence, plan, code, or date. Adding/changing structured zoning clears existing property verification; plan to review those badges again. The Kabin Buri correction sets green, owner reported, source “พี่ไกรแจ้ง ยังไม่มีหลักฐานทางการ”, with other fields empty. Migration aborts if that listing already has map/document evidence, allowing a human to reconcile it first. The migration uses a transaction; application/database rollback must preserve a copy of `zoning_info`, since the legacy column cannot represent multiple colors.

`/submit-land` stores zoning in the existing owner lead `details.zoning_info` through both lead entry paths; submission does not publish a listing or grant a verification badge. `/manage/zoning` is a development-only editor for sample records with live card/detail/metadata preview and SQL download. It does not persist changes. SQL defaults to `ROLLBACK`; an authenticated database operator must inspect the target and evidence before intentionally committing. Connect a production management UI only after server-side admin authorization exists.

Validation:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
# Only on an empty disposable PostgreSQL database (never production):
psql -v ON_ERROR_STOP=1 -d <disposable_database> -f scripts/zoning-migration-test.sql
# Start the build without DATABASE_URL before running:
node scripts/marketplace-smoke.mjs http://127.0.0.1:3101
```

The SQL harness applies the migration twice, checks multi-color synchronization, validation, verification invalidation, and preservation of existing reviewed evidence. Its final migration attempt intentionally errors and rolls back to test that protection.
