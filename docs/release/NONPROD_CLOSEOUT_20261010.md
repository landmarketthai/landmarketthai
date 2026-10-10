# LandmarketThai — Non-Production Job Closeout (2026-10-10)

**Engineering/UAT status: PASS for completed, safely isolated engineering gates. Real external integrations remain BLOCKED, so Production remains NO-GO.** This is NOT approval to merge, migrate or deploy Production.

## Scope and immutable boundaries

- GitHub repo: `landmarketthai/landmarketthai`; only `codex/release-integration-20261009` may be pushed/deployed as Preview.
- Last source-changing commit: `0c8faa7`; reviewed branch state before this addendum: `2f2edf8`. No code changes were necessary in this closeout.
- Production GitHub `main` remained `3d49c2b`, and Production Neon branch `br-solitary-mud-az74nksn` was NOT modified. No Vercel Production deploy, Production environment setting, live webhook call or real DO Spaces upload was performed.
- Production Cloudflare keys exist as Vercel Environment Variables, but the new code has NOT been promoted to Production.

## Checks already completed (sources: Opus + independent Sol reports)

- `npm test`: **308 passed, 0 failed**; TypeScript, Lint and Production Build: **PASS**. Independent Codex Sol 6.1 High read-only final audit found no serious source/rollback blocker and additionally passed **41 targeted tests** and **19 zoning-smoke self-checks** (mocked, non-Production).
- Disposable local PostgreSQL 18.6 full-stack E2E: **16/16 PASS**. Turnstile Siteverify, n8n sink and storage were **simulated**; no external production systems contacted.
- Vercel combined Preview from `2f2edf8`: **READY**, URL `https://landmarketthai-m90g6lnk0-landmarketthai.vercel.app`. Previous on-Preview browser checks: public pages, Google Admin OAuth, stale-edit rejection (409), tokenless protected writes (403) and no draft on viewing `/sell`.
- Kabin Buri 101 rai business decision from พี่ไกร: **green zoning and generic listing review = verified**. Preserve `zoning_info.status=owner_reported` and `source='พี่ไกรแจ้ง ยังไม่มีหลักฐานทางการ'`. This does not assert independent official zoning or title-deed verification.
- Parent Preview UAT Neon `br-noisy-sun-az5krbgi`, project `dry-hill-07009531`: rate limiter function patched with `SKIP LOCKED`. Role `landmarketthai_owner` owns both limiter table/function, has execute permission and matches the UAT connection role. UAT Kabin row reviewed as `verified` without changing `owner_reported`.

## Real Neon isolated rollback rehearsal: PASS

**Disposable branch only:** `br-bold-rain-azy4ax9e` (`landmarketthai-rollback-disposable-20261010`), cloned from UAT `br-noisy-sun-az5krbgi`, NOT from Production.

1. Before: 3 `lands`, 8 `property_submissions`, 2 `sync_land_zoning_info` triggers, valid-zoning function present, Kabin `verified`. Saved full-row fingerprints:
   - `lands`: `8a142228d356bc0e428e3a54bbdf9e45`
   - `property_submissions`: `e4fab60510c3d97ba8129a99e69573c2`
2. Executed the **non-data-loss zoning rollback** statements on the isolated child (dropped zoning sync triggers, CHECK constraints, sync/validation functions; retained `zoning_info` columns and all data) in a transaction. Immediately after, triggers = 0 and both fingerprints were unchanged.
3. Reapplied every statement of `neon/migrations/202610080001_zoning_info.sql` within a transaction on the child. Full restoration succeeded: 2 triggers, validator and constraints present; both fingerprints still unchanged.
4. Repeated the rollback **twice** on this same disposable child to test idempotency (both succeeded), then reapplied the full zoning migration again (16 statements; succeeded).
5. Final full-row fingerprints: **exactly equal to before**. Kabin remained `verification_status=verified`, `zoning_info.status=owner_reported`.
6. Ran the genuine read-only `scripts/zoning-postflight.sql` query on the disposable child: **6 PASS, 0 FAIL, 1 REVIEW, 3 INFO**. The REVIEW was the expected owner-reported source text for the one Kabin listing, accepted per พี่ไกร decision. No unexpected row, column, constraint or trigger changes.
7. On the same disposable child, executed the real limiter function with the throwaway `release_verify` bucket and 64-character synthetic client hashes. Sequential results (retry seconds): first A **0**, second A **0**, over-quota A **60**, first B **0**, new C after global quota **60**. This independently confirms app-role function execution, per-client/global quotas and denial not charging global quota. No Production or active UAT rate-limit counter was touched.
7. Caveat: the `zoning-preflight.sql` query was not captured *before the first migration on this child*: this child already inherited the zoning schema. The earlier **full-chain migration-preflight/postflight from a pristine schema** was independently exercised on disposable local PostgreSQL. Before any future Production migration, run the Production read-only preflight against the exact Primary branch and save its catalog snapshot.

## Remaining non-production integration gates — not silently waived

- **DO Spaces upload**: Vercel Preview branch has **no dedicated `DO_SPACES_*` test bucket environment**. A real signed PUT/HEAD/confirm against a dedicated, non-production bucket was not tested. Offline presign/confirm security tests passed.
- **n8n webhook**: Preview's `N8N_WEBHOOK_LEADS` is deliberately set to `https://example.invalid/uat-disabled-no-real-leads`, so no real test notification was sent. A dedicated test workflow/sink is required before declaring delivery PASS.
- **Real PartnerForm Server Action: PASS on Preview**: Submitted a clearly tagged synthetic applicant `[UAT-TEST-20261010] Partner Form E2E` through `/become-partner` with dummy Turnstile token; UI displayed `สมัครสำเร็จ`. Verified the UAT `leads` total rose **4 → 5**, partner leads **0 → 1**, exactly one tagged test record. The Preview webhook remains intentionally disabled; this does NOT prove n8n delivery.
- **Other real browser gaps**: Live non-admin OAuth rejection and real non-production webhook/storage are not proven by local mocks alone. They must either pass against dedicated test identities/services or be explicitly accepted by the release owner as residual risk.
- **Product choice**: Buyer requirements and seller submissions create lead rows in the Admin queue but do **not** currently call n8n; only the lead API and the lead Server Actions do. Decide whether the other two must notify n8n before Production.
- **Production-only gates**: Explicit Production Release permission, Neon Production restore point/checkpoint ID, read-only Production preflight, all Production environment checks and Production smoke checks **remain undone**. Never infer deployment permission from authorization to test Preview or business approval of Kabin Buri.

## Decision and handoff

**Non-production engineering/rehearsal job:** finished where safe; documented exceptions above.  
**Real external integration UAT:** BLOCKED pending a test DO Spaces bucket and test n8n workflow URL (do not paste keys in chat; configure secrets in Vercel Preview only).  
**Production:** **NO-GO** until the owner explicitly authorizes and all required release gates pass or residual risks are explicitly waived.

Follow `INTEGRATION_RELEASE_CHECKLIST_20261009.md` for the production phase sequence; never merge/deploy/migrate Production automatically.
