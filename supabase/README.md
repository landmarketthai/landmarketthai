# LandmarketThai Supabase database workflow

## Database baseline

This repository has two database surfaces with different purposes:

- `schema.sql` is the **full current schema snapshot** used to bootstrap a fresh Supabase/PostgreSQL database.
- `migrations/` contains **incremental changes** for databases that already have the LandmarketThai baseline.

Historical migrations were introduced after the full marketplace schema already existed, so **do not bootstrap an empty database from `migrations/` alone**. The migration chain intentionally fails closed if required baseline tables such as `lands` or `deals` are missing.

## Fresh environment

1. Create a fresh Supabase/PostgreSQL database.
2. Apply `schema.sql`.
3. Apply any migrations newer than the schema snapshot only when needed by the deployment process.
4. Run `tests/crm_integrity.sql` against a non-production database before deployment.

## Existing environment

1. Back up the database.
2. Confirm the expected baseline tables exist.
3. Apply pending files in `migrations/` in timestamp order.
4. Run `tests/crm_integrity.sql` in a test/preview environment.
5. Deploy the application only after the database migration succeeds.

## Local PostgreSQL dry-run

A disposable PostgreSQL container can validate schema and migrations without touching Supabase production. The audit performed on 2026-09-22 used PostgreSQL 17 and verified:

- `schema.sql` applies successfully from a fresh database.
- all repository migrations apply successfully on top of the full baseline.
- the CRM integration test runs inside a transaction and rolls back its test data.

The `migrations/` directory alone is not a fresh-database bootstrap and should not be treated as one.

## Security contract

Public forms submit through server API routes or Server Actions. Direct `anon`/`authenticated` inserts into `leads`, `lead_attachments`, and `events` are intentionally revoked so callers cannot bypass application validation, consent handling, or referral attribution rules.

CRM mutation RPCs are `security definer` functions with a fixed `search_path` and execution is granted only to `service_role`.
