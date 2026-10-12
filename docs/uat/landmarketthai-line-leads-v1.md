# LandmarketThai LINE lead notification V1 — Safe implementation handoff (2026-10-12)

## Destination
- LINE group: **Land Market Thai** (existing user-selected group)
- LINE OA: **ตลาดที่ดินไทย.com**, LINE ID: `@landmarketthai`
- OA membership confirmed by operator on 2026-10-12; `groupId` and Channel Access Token are **NOT YET verified**.

## Existing completed checks
- Phase B non-admin OAuth / API guard: PASS
- Seller upload pause and no-image submit on dedicated Preview: PASS
- n8n Cloud synthetic-lead test: POST valid UAT -> HTTP 200, non-UAT -> HTTP 422
- Dedicated Vercel Preview and Neon UAT only; Production/PR #11 untouched

## New draft
- File: `landmarketthai-line-notification-v1-draft.json`
- 7 nodes, **inactive**, uses Header Auth, rejects non-preview events and malformed IDs.
- The LINE push node has **no credentials** and the group ID is deliberately `REPLACE_WITH_LINE_GROUP_ID`: it fails closed.
- LINE message sends no contact information; only lead type, pending review status and admin CRM link.
- Push uses `X-Line-Retry-Key` based on lead UUID for idempotent retries.

## Hard blockers before publishing
1. Inspect existing LINE Developers webhook endpoint for the exact `@landmarketthai` Messaging API channel. **Never overwrite an existing receiving webhook**, as doing so may interrupt real customer messages.
2. Obtain LINE group ID from a signed webhook event `events[].source.groupId` (`source.type=group`), not from the group display name. Do not log message bodies or tokens.
3. Store the existing Channel Access Token in n8n credential as `Authorization: Bearer <token>`, never in workflow JSON or source.
4. Create a strong Header Auth credential and update only the dedicated LandmarketThai Preview sender to include it; do not connect the current unauthenticated UAT endpoint to a LINE sender.
5. Import draft as a **separate workflow**; configure both credentials and group ID; test with synthetic Lead only, confirm in LINE group and n8n execution log.
6. Production remains **NO-GO** without explicit owner approval, durable delivery/retry solution and a safe privacy review.

## Verification acceptance criteria
- Unauthorized webhook -> 401/403 and zero LINE sends
- Invalid event / non-preview -> 422 and zero LINE sends
- Authorized synthetic buyer/owner/partner -> at most one LINE alert each for one lead event
- A repeat delivery of same lead ID does not post duplicate messages during the LINE API retry-key window
- Missing LINE credential or group ID -> fail closed, no message, visible execution error
- No customer phone, email, title-deed files or other private information in LINE notification
- No change to `main`, Production deployment, Production DB, or OA receiving webhook configuration
