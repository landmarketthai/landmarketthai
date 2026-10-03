# Partner operations V1

Staff pages: `/admin/partners` and `/admin/partners/[id]`. Pages use the existing server session gate; APIs return JSON 401/403 before querying the database. No public partner identity or dashboard is introduced.

## Integration

Apply `db/migrations/20261003_partner_operations.sql` through the normal reviewed migration process. It has **not** been applied to Neon. It adds missing deal commission/stage/timestamp and attribution deal columns for the legacy schema; existing pipeline columns are preserved with `IF NOT EXISTS`. Coordinate the `stage` definition with the pipeline branch before applying. `stage = 'won'` is the only payable outcome; `in_progress` deals excluding won/lost/cancelled are projected. Pending, active, and inactive partners remain visible to staff.

The unique partial index rejects historical duplicate `partners.lead_id` values, and the commission constraint rejects historical negative/NaN amounts; resolve those manually before applying. The migration recomputes `partners.total_paid` from existing deal payments. Database functions run with invoker rights; their owner/backend role must have execution rights. Public execution is revoked on mutation functions. The backend must retain the same trusted database credentials pattern as existing admin operations.

Partner approval creates an **active** partner, copies contact and `details.working_area`, `details.experience`, `details.network_size`, and sets the lead to **qualified**. `won` remains a deal outcome. The referring partner's code on the lead is preserved; the new partner gets its own deterministic `LMT-<full uppercase UUID>` code. A uniqueness conflict retries with `-1`, `-2`, etc. A lead lock and unique index make concurrent conversion safe. Existing conversion returns the existing partner without changing its status or emitting another event.

All commission input amounts are decimal **strings**, with at most 16 whole digits and two decimal places. Expected may be null (unknown); cumulative paid must be supplied and cannot be null or negative. Both fields are replaced together. Excess paid requires the literal boolean `override: true` and is recorded in `events.meta` with authenticated `actor_id`, old/new values, and `exceeded_expected`. Exact retries emit no duplicate events. The database function repeats amount validation; an event failure rolls the entire mutation back.

The paid-total trigger covers insert, payment update, reassignment, and deletion. It locks affected partners in UUID order then recalculates with `SUM`, never an increment. Other writers must leave this trigger enabled. Multi-row pipeline writes should use a stable deal/partner order and retry database deadlock errors; concurrent single-deal payments are tested.

Counts use unique attributed leads; converted counts require `referral_attributions.converted = true` **and** a linked deal whose stage is won. Pipeline integration should set attribution `deal_id` and `converted` when appropriate. A legacy null `partner_id` attribution is matched by the partner's exact referral code. Deals are linked by explicit `deals.partner_id`; a code alone does not assign a commission recipient. Unknown expected values contribute zero to totals and remain blank in editing forms. Paid totals include every linked deal, including historical closed/cancelled deals with actual payments. Payable is the sum of unpaid positive balances on won deals; projected is the expected amount on open deals.

The detail page copies the referral code. Existing public pages do not wire a referral query parameter into their forms, so this change does not invent a public referral URL; public capture integration belongs to the referral intake flow.

## APIs

- `GET /api/admin/partners`: partner summaries and unconverted partner leads.
- `POST /api/admin/partners`: `{ "lead_id": "uuid" }`, idempotent approval.
- `GET /api/admin/partners/[id]`: identity, attributions, linked deals.
- `PATCH /api/admin/partners/[id]`: `{ "status": "active" | "inactive" }`.
- `PATCH /api/admin/partners/deals/[id]/commission`: `{ "expected_commission": "100.00" | null, "commission_paid": "25.00", "override": false }`.

All responses are private/no-store. Invalid input is 400, missing records 404, other database failures 500 without exposing SQL errors. Mutation events are `partner_converted`, `partner_status_changed`, and `deal_commission_changed`. No other admin pages were edited.

## Checks

`npm test` includes `src/lib/partner-operations.test.ts`: code generation, exact money/override validation, recalculation, API session/actor wiring, and page auth gates.

For database checks, initialize a **disposable local PostgreSQL** database owned by `partner_test`, listening on 127.0.0.1:55439. Run `psql -h 127.0.0.1 -p 55439 -U partner_test -d postgres -v ON_ERROR_STOP=1 -f db/tests/partner_operations_fixture.sql -f db/migrations/20261003_partner_operations.sql -f db/tests/partner_operations.sql`. The fixture is only for an empty local test database. The sequential SQL checks roll back. Then run `node db/tests/partner_operations_concurrency.mjs` (set `PSQL_BIN` to the installed psql path if needed). The concurrency script writes only to the hardcoded local test connection, leaves fixtures in that disposable database, and checks production summary SQL without network dependencies.
