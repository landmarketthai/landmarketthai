LandmarketThai Project Context

Project
LandmarketThai

Purpose
Industrial land marketplace and referral platform.

Business Goal
Generate qualified leads from
- Referral partners
- Land owners
- Investors / buyers

Current Properties
- 37 Rai EEC Rayong
- 101 Rai Kabin Buri

Tech Stack
- Next.js 15 App Router
- TypeScript
- Tailwind CSS v4
- Neon Managed Better Auth + Google OAuth
- Neon Postgres
- Vercel
- DigitalOcean Spaces
- n8n

Database and Auth
- `DATABASE_URL` is server-only and points to Neon Postgres.
- Browser auth uses Neon Managed Better Auth.
- `NEXT_PUBLIC_NEON_AUTH_URL` may override the managed auth endpoint.
- Do not reintroduce Supabase clients or Supabase environment variables.
- Keep database writes server-side unless Data API permissions are explicitly reviewed.

Branch Strategy
- develop  development branch
- main  production branch

Current Priorities
1. Lead Capture
2. n8n Lead Notification
3. DigitalOcean Spaces Upload
4. Production Verification

Working Rules
- Keep implementation simple and production-ready.
- Prioritize lead generation over experimental features.
- Do not add unnecessary complexity.
- Do not build AI chat features before the lead flow works.
- Do not break SEO structure.
- Reuse existing components where possible.
- Run lint/build checks before finalizing changes.
- Ask before making large architecture changes.
- Never commit `.env.local` or database credentials.
