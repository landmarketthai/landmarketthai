# Supabase → Neon migration (2026-09-28)

## Status

Application migration is complete in branch `feat/neon-public-reads` and verified locally on Next.js 15.5.24.

### Moved to Neon

- Public listing reads
- Province/category/blog/buyer-demand reads
- Lead capture writes
- Referral attribution
- Events
- Upload attachment metadata
- CRM tables: leads, partners, deals, commissions, lead activities, automation runs
- Google OAuth via Neon Managed Better Auth

### Removed from application source

- `@supabase/supabase-js`
- `@supabase/ssr`
- Supabase browser/server clients
- Supabase session middleware
- Supabase environment-variable dependency

## Verification

- Unit tests: 6/6 pass
- ESLint: pass
- Production build: pass
- Local `/land`: ~0.5 s
- Local `/land/rayong`: ~0.3 s
- Synthetic lead insert into Neon: verified

## Production deployment prerequisite

Vercel must have a server-only `DATABASE_URL` for the Neon production database. Never store that connection string in source control.

The public Neon Auth endpoint is not secret. The app has a production default endpoint in `src/lib/auth/client.ts`, and it can be overridden with `NEXT_PUBLIC_NEON_AUTH_URL`.

## Historical files

`supabase/schema.sql` is retained only as historical reference. It contains Supabase-specific RLS roles/policies and must not be applied to Neon as-is.
