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
