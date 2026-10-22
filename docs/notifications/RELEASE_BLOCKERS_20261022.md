# Release blockers — cost and bounded external UAT

2026-10-22, Asia/Bangkok. Continues PR #12 at `3d4949b`; both PRs stay DRAFT. **ENGINEERING GO / PRODUCTION NO-GO.** This decision supersedes the one-minute recommendation in [the earlier readiness report](READINESS_20261022.md). No plan upgrade, scheduler activation, Production change, live LINE send or receiving-webhook change was performed.

## Decision and accepted delay

The owner selected **up to 15 minutes for recovery** on 2026-10-22. Recommend **Vercel Pro native Cron every 15 minutes, the existing immediate `after()` path and durable Neon outbox, and Neon Launch with scale-to-zero retained**. Keep claims, leases, retry keys, request fingerprints, retry ceilings, retention and metrics unchanged. Do not keep the DB deliberately warm. No external scheduler, queue service, self-hosted process or Neon Function is needed.

This is a recovery cadence, not a hard 15-minute delivery SLA. With a healthy provider and no backlog, the initial attempt normally runs in seconds; an interrupted first callback waits zero to 15 minutes for Cron. A failed first attempt with 30-second backoff waits approximately **30 seconds to 15 minutes 30 seconds**, plus execution/cold start. Later backoff and Retry-After can exceed a tick. The owner's approximate delay preference is recorded; a strict maximum of 15 minutes would require a shorter cadence and separate acceptance. Never promise a notification during a LINE outage.

The approved-release Cron expression would be `*/15 * * * *` (Bangkok :00/:15/:30/:45 as well as UTC, subject to provider delay). **The checked-in daily Cron is unchanged** because the current team remains Hobby. All three sub-daily options require Pro; reducing cadence does not resolve Hobby's commercial-use restriction. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Hobby policy](https://vercel.com/docs/plans/hobby).

## Cost, capacity and latency comparison

Model: 30 days, one scheduler/endpoint, 0.25 CU minimum while awake, default five-minute idle tail, short empty sweep, no other queries. These are scheduler-only steady-state estimates, not full-project usage or measured billing. Worker endpoint executes four statements when empty. Each sweep attempts at most three jobs and stops on 429/time budget; real capacity can be lower.

| Recovery cadence | Invocations / empty SQL statements per month | Scheduler-only CU-hours, 30d (31d) | Launch compute equivalent | Invocation line item before credit | Maximum attempts/hour | First retry, healthy/no backlog |
|---|---:|---:|---:|---:|---:|---|
| 1 minute | 43,200 / 172,800 | 180 (186) | $19.08 | $0.025920 | 180 | 0.5–1.5 min + execution |
| **15 minutes** | **2,880 / 11,520** | **60 (62)** | **$6.36** | **$0.001728** | **12** | **0.5–15.5 min + execution** |
| 30 minutes | 1,440 / 5,760 | 30 (31) | $3.18 | $0.000864 | 6 | 0.5–30.5 min + execution |

Compute formula: `0.25 × 720 × min(1, idle_tail_minutes / interval_minutes)`. Query/runtime/retry activity extends the warm tail; autoscaling increases CU consumption. If an effective idle tail is ten rather than five minutes, the 15/30-minute estimates become 120/60 CU-hours. API metadata reports `suspend_timeout_seconds=0`; that raw field alone does not prove an effective timeout. Management state shows endpoints can idle, but an isolated measured idle-tail test remains required. The five-minute model follows [Neon lifecycle documentation](https://neon.com/docs/introduction/compute-lifecycle).

An enabled scheduler on a Preview/UAT endpoint incurs another endpoint's usage; the allowance is per project, not per branch. Two otherwise idle 15-minute schedules would already model 120 CU-hours/30d. Do not activate routine Preview polling. A minute health probe that queries Neon can defeat the savings of a 15-minute worker. Prefer management-plane usage checks and reuse worker metrics instead of a second DB polling loop.

Invocation estimates use the current published Pro rate `$0.0000006` per call; CPU/memory, edge requests and shared usage are additional. An illustrative 2 GB / two elapsed seconds / 50 ms active CPU empty invocation at Singapore rates costs approximately $0.66 across 43,200 calls, $0.044 across 2,880, or $0.022 across 1,440, including the invocation line item, before Pro credit. This is a sizing illustration, not a runtime measurement. Pro has a $20 platform fee, one deploying seat and $20 usage credit; additional deploying seats cost extra. [Per-unit invocation billing](https://vercel.com/changelog/function-invocations-now-billed-per-unit), [resource prices](https://vercel.com/docs/functions/usage-and-pricing), [Pro billing](https://vercel.com/docs/plans/pro-plan).

Recovery capacity is shared with retries. Thirty eligible jobs without new `after()` invocations require ten full sweeps: up to roughly 10/150/300 minutes at 1/15/30-minute cadence, plus runtime. These are capacity ceilings, not guarantees. Each normal submission may trigger another sweep, but recovery must work without it. A LINE outage can use eight attempts on a job in roughly 1–3 hours with minute/15-minute scheduling (phase dependent); after that an operator must reconcile the terminal failure. The 23-hour ambiguous-send cutoff remains well inside LINE's 24-hour retry-key window. A long outage, missed ticks or backlog can still exhaust the window. The 30-minute option halves recovery capacity and breaches the selected delay preference to save only about $3.18/month of scheduler-only Launch compute.

## Actual shared Neon usage — Free is not a release assumption

Read-only management evidence around **2026-10-22 12:32 Bangkok**, project `dry-hill-07009531`, current period Oct 1–Nov 1 UTC:

- Project `compute_time_seconds=293608`: **81.558 CU-hours**, leaving about **18.442** of the published 100 CU-hour Free allowance.
- Production branch: **77.637 CU-hours**. All other branches combined: **3.921**, including archived branches' consumption earlier in this period. Archiving does not refund consumed hours.
- At 21.231 elapsed days, a simple month-to-date extrapolation is **119.09 CU-hours for October**, before adding this scheduler. This is a projection, not a forecast from daily traffic or proof of the traffic source.
- Listed endpoint minimum/maximum sizes are 0.25–2 CU for Production and the disposable/active UAT endpoints; all were idle in the management snapshot. Current idle state is not evidence that future web, Auth, crawler or Preview traffic is zero. No Production SQL was queried.

The total combines existing warm intervals with scheduler warm intervals: **do not blindly add two overlapping estimates**. A conservative planning bound can add the whole scheduler-only estimate to the current baseline; actual incremental usage may be smaller because traffic overlaps. Historical totals do not reveal overlap timing, recent changes, CPU bursts, or which requests kept compute awake. Existing usage is already projected above 100, so neither 60 nor 30 scheduler-only CU-hours proves Free sufficient. Free quota exhaustion can suspend service; do not rely on paid overage automatically occurring on Free. [Neon pricing](https://neon.com/pricing).

For the selected cadence, pricing the 31-day baseline at Launch is about `119.09 CUh × $0.106 = $12.62`; adding all 62 scheduler-only CU-hours gives a conservative **$19.19 compute subtotal**, before storage/history and changed traffic. Minimum warm polling alone is $6.57/31d. Launch bills paid usage rather than preserving Free's 100-hour credit. Existing eight branches are within the published ten included branches; review organization-wide usage before changing its plan.

**Recommended planning budget: USD $40/month for Pro plus Neon, with a USD $50/month review envelope to cover small storage/usage variation and a monitoring contingency.** Neither number is a hard cap. Extra seats, other projects, unusual load, monitoring subscriptions, LINE messages, media and tax are excluded unless explicitly budgeted. A paid monitoring add-on must not be activated from this envelope implicitly. Measure actual spend after seven days and review endpoint idle time, per-branch consumption and retry/backlog counts. Neon Free could be reconsidered only after measured combined usage leaves substantial headroom; require a forecast below 80 CU-hours including planned polling and UAT reserve, not merely below 100.

## Monitoring gate

Preserve the existing authenticated metrics and structured terminal/sweep logs. For 15-minute recovery, propose alerts for: no completed sweep for 35 minutes, oldest outstanding event over 30 minutes, a lease still expired after the next sweep, any new terminal failure, or sustained arrivals approaching 12 recovery attempts/hour. Operator acknowledgement target: 30 minutes during the agreed coverage window; name the operator and out-of-hours policy before release.

These alerts are **not connected or tested**. Vercel does not retry failed Cron invocations. Built-in error-anomaly alerts are not a complete substitute for low-volume per-job failure/backlog/heartbeat checks, and the worker can return HTTP 200 while reporting failed rows. Ordinary Pro billing does not imply all alert products are included; published Observability Plus is a separate $10/month add-on and still does not itself establish the required checks. Do not buy it without a concrete tested alert design. First reuse an owner-confirmed existing alert channel/monitor; if none exists, obtain a separate monitoring choice/budget. Logs alone do not close this gate. [Cron failures](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [alerts](https://vercel.com/docs/alerts), [Observability Plus](https://vercel.com/docs/observability/observability-plus).

## No-send LINE preflight — prepared, real identity still blocked

Historical authorized destination: **Land Market Thai**, OA **ตลาดที่ดินไทย.com / `@landmarketthai`**. The earlier handoff explicitly says the group ID and token were unverified. On this review the existing signed/no-send capture execution page initially had a lost connection; after a successful refresh it still showed **No executions found**. No signed group evidence was recovered, and no workflow was executed or edited.

Read-back of older Preview `codex/phaseb-upload-pause-20261012` confirms sensitive `LINE_CHANNEL_ACCESS_TOKEN_UAT` and `LINE_CHANNEL_SECRET` settings. No group-ID variable is present there. The token read returned metadata without a usable plaintext value. This matches Vercel's [Secret behavior](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types); do not extract it through logs, add an export endpoint, weaken protection, or rotate the active token merely to obtain a copy.

`node scripts/line-uat-preflight.mjs` is now prepared for **one private JSON line via non-echoing stdin** containing `rawBodyBase64`, `signature`, `channelSecret`, `token`, owner-confirmed numeric `channelId`, and approved `groupId`. Never put these inputs in command arguments, source, chat, committed fixtures or screenshots. `rawBodyBase64` must encode the exact original signed request bytes, not reserialized JSON. Use an existing securely retained signed event from the unchanged receiver (at most 24 hours old), not a fabricated capture or a client-generated signature. The operator supplies the channel ID from the intended Messaging API channel in LINE Developers Console.

The preflight validates HMAC-SHA256 before parsing, checks recent group events against that exact ID, uses LINE's read-only token-validity POST to bind `client_id`, gets bot info to bind the signed `destination` and `@landmarketthai`, and gets the group summary to match both ID and **Land Market Thai**. It emits only sanitized identity/digest evidence and **zero Push requests**; success explicitly does not authorize sends. It supports existing short/long-lived tokens; a different token type fails closed and needs the corresponding documented verification flow, not token rotation. It never touches a DB, issues a token, changes a webhook or invokes a message endpoint. [LINE API reference](https://developers.line.biz/en/reference/messaging-api/nojs/), [signature contract](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/).

**Current real preflight status: BLOCKED** by unavailable private token/channel evidence and signed group event. No OA/channel/group identity success is claimed. The self-check uses synthetic transport only and tests wrong signature, stale/mismatched group, channel/OA/bot mismatch and failed API responses.

## Five-alert / seven-request window — still requires explicit approval

Use the five genuine Buyer / Owner / Partner / Requirement / Seller scenarios in [the readiness packet](READINESS_20261022.md). Keep the native Preview flag false and all ordinary workers/schedules disabled; genuine events may queue safely. Require exactly this batch's five isolated outbox jobs and no others, immutable persisted retry keys and the feature Preview admin URL. A group observer must confirm destination and five receipts; check message quota headroom without exhausting it.

`scripts/line-uat-transport.mjs` prepares an operator-only transport adapter, **not an enabled sender or application import**. It requires a fresh successful preflight, explicit approval marker and an expiry at most one hour away; pins the known feature Preview URL; accepts exactly five event types and five existing retry UUIDs; freezes bodies/destination; journals reservations before network access; and blocks request eight. Exclusive journal creation refuses reuse/restart of a window. Unexpected HTTP or ambiguous network outcomes close the transport. Import it only into the isolated actual-worker harness after the human approves the exact window; never add a production fault-injection flag. Keep the journal private; it contains request UUIDs/hashes, not credentials or message bodies. Reconcile its original window after interruption; do not delete it or create another journal to reset the allowance.

| Push ordinal | Purpose | Expected response / visible alerts |
|---|---|---|
| 1 | Buyer first attempt; harness locally drops an already accepted response | 200; first alert; simulated lost acknowledgement only |
| 2 | Actual worker recovery, same buyer UUID/body/group | 409 with accepted-request ID; zero new alerts |
| 3–6 | Owner, Partner, Requirement, Seller first attempts | Four 200s; four further alerts |
| 7 | One exact replay of an accepted request | 409 with accepted-request ID; zero new alerts |

Hard ceiling: **five distinct alerts / seven HTTP Push requests**, including retries/ambiguous responses. No new retry UUID, blind retry, extra batch or ordinary enabled worker is permitted. The transport limits requests and keys; actual LINE deduplication/visible receipt still needs this real test. Stop immediately for an unexpected destination, extra alert, API error, expired window or uncertain outcome; reconcile rather than spending the remaining allowance. Unexpected errors may leave the planned test incomplete. Keep 429/5xx/permanent-error injection in the existing fake transport. No live-send approval has been given.

## Safe zero-website-traffic scheduler rehearsal — prepared, not activated

Native Vercel Cron is Production-target only; it does not execute on the protected feature Preview. Do not call a manual invocation, laptop loop or GitHub scheduled workflow proof of native Cron reliability. Do not change the real application's Production target to test scheduling.

After explicit owner approval of Pro and the isolated test target/cost: use a **separate temporary Vercel test project** in the same approved team, with its own deployment-protected target and the existing disposable Neon branch only. Here the provider's target label may be Production, but the project/DB must be demonstrably isolated from Landmarketthai Production. This separate project has **not** been created. Approve its access/credential storage and removal separately. Do not copy any real LINE token/group into that project.

Prepare its fixture from the actual outbox module with a fake LINE transport and synthetic configuration; enforce outbound denial of LINE message APIs. No app fault flag is added. Configure native Cron `*/15 * * * *`, an independent bearer, and any provider-required protection access without disabling protection. Confirm the exact DB endpoint/role, fingerprint baseline, and an empty outbox before seeding exact synthetic IDs.

1. Seed one genuine synthetic lead/job; run a setup attempt with fake timeout so it is due after setup traffic stops. Add a separate synthetic expired-lease case. Record exact IDs and retry keys; no historical row is used.
2. Stop website/form activity and SQL polling for **at least 45 minutes / three planned ticks**. Use provider logs and Neon management metadata, which do not wake DB compute, to observe; a browser/app ping would invalidate idle-cost measurements.
3. Require independent provider invocations, bearer authorization, same-key recovery through the actual worker, fake acceptance evidence for both jobs, no duplicate claims, and later empty sweeps. Record scheduled/actual timestamps, DB transitions, cold-start/runtime and operator alert receipt. A no-send rehearsal proves scheduler/DB behavior, not real LINE delivery.
4. Inject one fixture-only failed tick, verify operator notification and later recovery, and test the missing-tick/35-minute heartbeat alert. Stop on unexpected egress or any Production identity. Clean only exact synthetic IDs, verify original fingerprints, disable/remove the test schedule/project under its approval, and retain sanitized evidence.

Minimum 0.25 CU × 45 minutes is at most about **0.1875 CU-hours** if continuously warm, plus setup/runtime/autoscaling. Budget **0.5 CU-hours** for a bounded no-send run and verify actual usage; no billable capacity is silently provisioned. The current project has about 18.4 CU-hours remaining, but other traffic can consume it. Real LINE UAT, when approved, is a separate test using the seven-request allowance, not this fake-transport scheduler rehearsal.

## Exact next owner action and remaining gates

**Next action: securely make the original token/channel secret, intended Messaging API channel ID, and a recent raw signed group event available to the no-send preflight operator, and run the prepared no-send preflight.** Supply private material through the non-echoing local input or an explicitly authorized secure store; return only the sanitized PASS/digest evidence. If no retained signed event exists, arrange capture through the unchanged existing receiver; do not repoint the OA webhook. This is identity verification only, not authorization to send messages.

After identity passes, separately approve a dated, observed live window of five alerts/seven Push requests. Separately decide/approve Pro + Launch budget, the isolated scheduler target, and the actual operator alert channel/coverage. The selected 15-minute cadence is a preference, not permission to upgrade or activate it. Both PRs remain DRAFT; no Production migration/deployment or n8n cutover is authorized. **Verdict remains ENGINEERING GO / PRODUCTION NO-GO.**
