# Bounded real LINE UAT approval packet

Prepared 2026-10-22, Asia/Bangkok, PR #12. **NOT AUTHORIZED / NO SENDS PERFORMED.** Identity verified; delivery readiness remains conditional on credential-security disposition, fresh preflight, quota check and the explicit window below. Both PRs stay DRAFT.

## Verified destination and scope

- Intended channel **2012033225**, OA **ตลาดที่ดินไทย.com**, premium ID **@landmarketthai**, basic ID **@279zzyef**.
- Approved group **Land Market Thai**, exact private ID verified against the fresh signed event and LINE group summary. SHA-256 digest: `2c693cd987715af5b1e1ed90d6fba98b1a5a77a0adc69c74c703059b39f7fd32`.
- Strict real preflight PASS **2026-10-22T08:31:31.712Z**. This is historical evidence; the adapter requires a new proof no older than ten minutes before opening a live window. A changed token requires a fresh token/channel/bot/group preflight; the already signed event can be reused only within its 24-hour freshness limit and with the matching channel secret.
- Existing disposable Neon branch **br-bold-rain-azy4ax9e**, role **landmarketthai_owner** only. Protected feature Preview: `https://landmarketthai-git-codex-native-line-outbox-landmarketthai.vercel.app`. Keep Vercel Authentication, ordinary native delivery flag false and schedules inactive. Do not transfer a LINE credential into Vercel or any new destination without separate authorization.
- Use the existing operator-only `scripts/line-uat-transport.mjs` with the actual worker and a private in-process configuration. No new sender endpoint, Production setting or receiving-webhook change. Freeze and review exactly five genuine synthetic outbox jobs and their persisted UUID retry keys before opening the window; these rows are not seeded yet. Require no unrelated jobs and a saved original-data fingerprint baseline.

## Five scenarios and exact visible content

Create the existing genuine Buyer, Owner, Partner, private Requirement and submitted Seller cases described in [readiness](READINESS_20261022.md). Use synthetic contacts/consent; publish no listing or requirement. One committed lead produces one job. No historical row is repurposed. The visible message is the existing application template:

```text
Landmarketthai — มีลูกค้าใหม่

ประเภท: <label below>
สถานะ: รอทีมงานตรวจสอบ

ดูรายละเอียด:
https://landmarketthai-git-codex-native-line-outbox-landmarketthai.vercel.app/admin/leads
```

| Scenario | Frozen label | Expected visible alerts |
|---|---|---:|
| Buyer | ผู้สนใจซื้อที่ดิน | 1 |
| Owner | เจ้าของที่ดิน | 1 |
| Partner | ผู้สมัครพาร์ทเนอร์ | 1 |
| Requirement | ผู้ส่งความต้องการซื้อ | 1 |
| Seller | ผู้ส่งประกาศขายที่ดิน | 1 |

No contact details, lead IDs or new arbitrary message text are included. The group's observer correlates labels and receipt order with the isolated manifest. The Preview admin link remains authentication protected.

## Seven-request maximum sequence

| Push request | Operation | Required result |
|---:|---|---|
| 1 | Buyer first send, fixed buyer key/body/group | Real 200 acceptance. The harness consumes the real response, then simulates losing the acknowledgement locally before the worker persists success; no second network request is hidden here. |
| 2 | Actual worker recovery for that buyer with the same persisted key/body/group | Real 409 with accepted-request ID; mark sent, no second buyer alert. |
| 3 | Owner first send | Real 200, one owner alert. |
| 4 | Partner first send | Real 200, one partner alert. |
| 5 | Requirement first send | Real 200, one requirement alert. |
| 6 | Seller first send | Real 200, one seller alert. |
| 7 | Exact buyer accepted-key replay through the bounded transport | Real 409 with accepted-request ID, no additional visible alert or new outbox row. |

Hard ceilings: **five distinct visible test alerts and seven total LINE Push HTTP requests**, including timeouts, errors and retries. The real API's accepted-key behavior is unproven until this run. The journal reserves calls before network dispatch, refuses reuse/restart and binds five keys/bodies, destination and token to the proof. A real ambiguous network response closes the adapter; do not mistake it for the deliberate local lost-ack simulation or automatically resume. Use existing fake tests for 429/5xx/permanent errors; do not spend live requests on fault injection.

## Owner approval required before opening

The owner must first resolve the reported tool-output token exposure. Recommended action is an owner-controlled revocation/rotation plan, including existing-consumer inventory and separately authorized updates; do not rotate or update Production secrets from this packet. The raw capture retention setting is already restored. The owner explicitly chose **Keep execution #70 for owner review** on the separate cleanup question, so its raw event/header remain in n8n; do not delete it without a new instruction.

After that decision, request a concrete dated window with this scope:

> Approve five visible test alerts and at most seven LINE Push requests from the verified Landmarketthai OA to only the signed-verified Land Market Thai group, using the five isolated UAT jobs above, during **[date, start–end, Asia/Bangkok, maximum one hour]**. **[named group observer]** will confirm all five receipts and absence of duplicates. Stop on any unexpected result; no automatic extension or restart. This authorizes no Production change, normal worker activation, scheduler, webhook change, paid service, merge or n8n cutover.

Start/end and observer are deliberately unfilled because the owner has not approved a live-send window. Do not reinterpret “continue” or inbound-capture approval as this approval. Immediately before opening: verify current feature deployment/DB identity, exact manifest and fingerprints, valid token/channel/OA/group proof, LINE quota headroom, ordinary workers off, exclusive fresh journal and a private harness that counts every Push. No automatic retry outside the window. New credential storage destinations need their own authorization.

## Acceptance, stop and cleanup

Pass requires actual API status/request-ID evidence, five observed receipts, no duplicate buyer/replay receipt, all five jobs sent with immutable retry keys/fingerprints and no extra lead/job, plus request total no greater than seven. A 200 means API acceptance; recipient observation is separately required. Record sanitized counts/timestamps/job IDs/request IDs, never raw signed inputs or credentials.

Stop immediately on wrong destination, extra alert, missing accepted-request evidence, any unexpected HTTP/error/timeout, quota concern, deadline or uncertain count. Disable the private harness, reconcile accepted keys/journal and outbox state; obtain new approval before any further Push. Do not generate a new UUID to retry an accepted/ambiguous message or roll back to the old sender blindly.

After evidence, clean only the exact approved synthetic IDs and verify original fingerprints/empty outbox. Leave Preview protection, native flag false and scheduler inactive. Independent zero-traffic scheduling/monitoring proof remains a separate [no-send rehearsal](RELEASE_BLOCKERS_20261022.md). **A successful bounded LINE UAT alone does not authorize Production.**
