# Native LINE release readiness — blocker closeout

Updated 2026-10-22 (Asia/Bangkok). **ENGINEERING GO / PRODUCTION NO-GO**.
This report supersedes the infrastructure unknowns in the initial QA report. No Production change, plan purchase, scheduler activation or real LINE send is authorized or performed.

## Confirmed infrastructure and decision

The owner’s existing authenticated Edge session displayed the Landmarketthai team billing page at [Vercel Billing](https://vercel.com/landmarketthai/~/settings/billing): **Hobby Plan — Active**. This resolves the earlier connector limitation. No Upgrade button was clicked.

Vercel's [Hobby policy](https://vercel.com/docs/plans/hobby) reserves that plan for personal, non-commercial projects. Landmarketthai's lead/referral marketplace is commercial use; a written exception has not been supplied. Using a free external scheduler would not resolve this hosting eligibility blocker.

**One recommendation: approve Vercel Pro with native one-minute Cron, and fund sufficient Neon compute capacity (Launch for continuous minute polling).** Keep the current outbox/worker on Vercel; retain `after()` for quick first attempts. This uses the two existing vendors and requires no forwarding function, extra scheduler account or self-hosted process. This recommendation is not authorization to change either plan or activate the cadence.

| Scheduler | Frequency and expected recovery | Cost / maintenance implications | Assessment |
|---|---|---|---|
| Vercel Pro native Cron | One sweep/minute; next tick after backoff, normally 30–90 seconds for the first retry plus execution time | $20/month platform fee with one deploying seat and $20 usage credit; existing worker only | **Recommended**, pending owner budget approval |
| Neon Scheduled Function | Minute schedules can wake compute without website traffic | Separate function packaging/deployment and authentication design; DB polling still consumes the same warm DB capacity. Functions have their own allowances/metering | No benefit large enough to justify moving this worker |
| External HTTP scheduling | cron-job.org offers minute POSTs/custom headers; timing and delivery not guaranteed | $0 scheduler subscription, third-party bearer-secret custody, 30-second request limit and independent failure monitoring; Vercel commercial plan still needed | Adds a vendor without avoiding the required hosting upgrade |

Sources: [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Pro billing](https://vercel.com/docs/plans/pro-plan), [Neon scheduled Functions](https://neon.com/docs/compute/functions/triggers/schedule), [external scheduler limits](https://cron-job.org/en/faq/). Neon’s schedule guide currently describes credential-free scheduled entry routes; its public invocation boundary would need a security design before use for this sender. It is not accepted as an unauthenticated way to invoke LINE delivery.

### Monthly operating estimate

Assumptions: 30-day month, one scheduler, one production DB endpoint, low event volume, no backlog, minimum 0.25 CU when warm. Estimates are USD before tax, other projects, extra deploying seats, storage/history, egress and LINE message charges.

- Minute cadence: `60 × 24 × 30 = 43,200` worker invocations/month, plus submission-triggered attempts. Empty endpoint sweeps execute four SQL statements (expiry, retention, claim, metrics): approximately 172,800 statements/month before events/retries. Capacity at the current batch size is three attempts/tick, shared with retries; this is not a high-throughput queue.
- Neon reports this project as **Free (`free_v3`)**. Its published database allowance is 100 CU-hours/project/month. A query every minute prevents the five-minute idle suspension: `0.25 × 24 × 30 = 180 CU-hours/month` even when there are no leads. Free capacity therefore cannot sustain the proposed continuous polling. All scheduler choices have this DB effect.
- At the published Launch rate, `180 × $0.106 = $19.08/month` for this warm minimum endpoint. A 31-day month is 186 CU-hours / $19.72. Average 0.5 CU would be $38.16/30 days. Existing web/database demand and other active endpoints add usage; this is a sizing estimate, not a maximum. [Neon pricing](https://neon.com/pricing), [idle lifecycle](https://neon.com/docs/introduction/compute-lifecycle).
- Vercel Pro contributes a $20/month platform fee. The idle sweeps should be a small part of its included usage credit, but shared project usage and actual CPU/memory duration must be measured. Singapore Fluid pricing is resource-based; do not equate elapsed DB wait with active CPU. [Function pricing](https://vercel.com/docs/functions/usage-and-pricing).
- Planning floor: approximately **$39.08/month** for Pro plus one minimum warm Launch endpoint, before the exclusions above. Suggested owner planning range: **$40–60/month** at low load, with spend alerts and review of other projects/seats before approval. This is not a guaranteed cap. No plan was upgraded.

Healthy initial attempts target seconds. With minute scheduling and no backlog, a 30-second backoff becomes roughly 30–90 seconds plus runtime; a 120-second Retry-After becomes roughly 120–180 seconds plus runtime. Provider delays, quota exhaustion, LINE outages and backlog can make this longer. Leased jobs become recoverable after two minutes and the next tick. No provider scheduling SLA or real LINE delivery latency has been measured here.

Keep the checked-in daily Cron until the approved Pro release changes it to `* * * * *`. Never push minute Cron while the actual team is still Hobby. Vercel native Cron runs on Production deployments, so the currently protected Preview cannot prove provider Cron behavior. The final release must include a separately approved zero-traffic scheduling test; no Production release is authorized by this report.

## Isolated Neon UAT — completed

Reused the preexisting disposable branch documented by the prior approved rollback rehearsal:

| Identity | Verified value |
|---|---|
| Project | `dry-hill-07009531` / LandmarketThai, Singapore |
| Branch | `br-bold-rain-azy4ax9e` / `landmarketthai-rollback-disposable-20261010` |
| Parent | UAT `br-noisy-sun-az5krbgi`, not the Production branch |
| Existing endpoint | `ep-little-hall-az7hht8k` |
| Database / application role | `landmarketthai` / `landmarketthai_owner` |
| PostgreSQL | 18.6 |
| Starting CRM counts | 4 leads, 0 requirements, 8 submissions, 3 lands, 0 partners, 0 attributions |

No branch, database, role or compute was created, and no endpoint sizing setting was changed. The existing Free allowance was used. Production `br-solitary-mud-az74nksn` was not queried or modified for these tests.

`scripts/line-neon-uat.mjs` accepts the connection URI only through non-echoing stdin, enforces this exact disposable endpoint/database/role, and uses the application’s actual Neon HTTP driver and modules. Direct/unpooled WebSocket sessions apply migration transactions and test competing claims. LINE transport is always intercepted; inventory matching is stubbed because the test concerns transactional persistence, not ranking.

Nine checks passed:

1. Real Neon application identity and original CRM fingerprints captured.
2. Outbox migration applied twice as the application owner; RLS enabled; anonymous/authenticated roles have no outbox read/insert privileges.
3. Actual buyer, owner, partner, requirement and seller persistence functions create exactly five distinct jobs; seller resubmission is rejected.
4. A failed requirement statement rolls its lead and notification back; a repeated enqueue conflict creates no duplicate.
5. Actual worker writes accepted status/timestamps/request IDs to Neon while LINE remains mocked; no customer name/phone marker appears in messages.
6. Timeout, 429 Retry-After, UUID reuse and permanent failure persist correctly on Neon.
7. Two real sessions cannot claim the same job; expired lease recovery changes the token; stale worker updates are fenced.
8. Rollback twice and migration reapply preserve CRM data.
9. Only this run’s exact synthetic IDs are cleaned up; original counts and row fingerprints match exactly.

Final independent readback: **0 outbox jobs, 4 leads, 0 requirements, 8 submissions**, outbox owner `landmarketthai_owner`. The additive outbox schema/trigger remains installed on this disposable branch for application UAT. Existing rows were not reset, truncated or backfilled. Real LINE sends: **zero**.

An initial test-harness credential-input timeout occurred before DB execution because Windows ConPTY delivered carriage-return line endings; the reader was corrected to accept CR/LF, then the complete rehearsal passed. This was not a database/application defect.

## Protected Preview — authorization and current evidence

The existing signed-in Edge session loaded the worker URL on Preview commit `88b6fa5` through ordinary Vercel Authentication. It displayed `{"error":"Unauthorized"}` from the application, without a worker bearer secret. This closes the deployed unauthorized-worker smoke check. No bypass token/link was created and Preview protection remains enabled.

The initial transfer of the UAT DB credential into Vercel was rejected by automatic approval review: isolated Neon testing did not explicitly authorize exporting its password to Vercel storage. The owner then explicitly approved **only** this existing branch/role credential to project `landmarketthai`, Preview branch `codex/native-line-outbox`. That transfer succeeded after approval.

Branch-only configuration now uses the approved disposable DB connection, its existing isolated Auth endpoint, the independent cookie secret, documented Cloudflare dummy test keys, and a Preview site URL. Human verification stays required and **LINE stays disabled**. No Production variable or existing other-branch credential was edited. No LINE token/group credential was copied.

Application UAT used the owner's ordinary authenticated Edge session on commit `a5754e1`, [READY protected Preview](https://landmarketthai-p1bvr0hiw-landmarketthai.vercel.app). No browser cookies were extracted into scripts, protection disabled, or bypass link created. The rebuilt worker again displayed `{"error":"Unauthorized"}` without its separate bearer credential.

Four real browser-to-Vercel-to-Neon submissions passed. Cloudflare verification used its documented dummy keys, while validation, Server Actions/API routes, application SQL and outbox trigger ran on the actual Preview/Neon services. LINE remained disabled throughout. Independent SQL readback found exactly one job per committed lead, all `pending`, with **zero attempts and zero sent jobs**:

| Browser scenario | Synthetic lead ID | Outbox job ID |
|---|---|---|
| Buyer `/contact` | `20242c09-91ff-4b8b-b96a-a3905d5cc527` | `d0cf329b-92bf-4fba-919e-3c409a0b64f4` |
| Partner Server Action `/become-partner` | `91f1d57d-fec0-492d-9f3e-45cc2fe3eccd` | `18b635d3-b955-4b06-b887-ead8cf76c6e8` |
| Requirement `/buy-request` | `8750604d-c13a-403e-b81d-9e4852d7a51b` | `97c1d8fa-ac20-4ad0-80fd-e852a87b3493` |
| Seller `/sell`, draft then submit | `2b3c588c-dd7c-40c0-8678-ea36970e2144` | `aff28cfb-97eb-4e7d-954e-b1876d0d9a12` |

Requirement `9a24de2f-3bbb-49a5-bfac-6bb814d6564f` had `pending_review`, PDPA true and public consent false; the browser showed saved/private status and a real inventory match. Seller submission `16be8d63-d0a8-4d2f-81c9-cc35692d54d3` had `pending_review`, linked the expected owner lead, and showed the submitted/not-published confirmation. No property or demand was published. Browser screenshots were retained locally as this run's proof; credentials and test tokens were not captured or logged.

Observed limitations: the first Partner attempt omitted consent and was correctly rejected with no record; the corrected fresh-page submission passed. Automatic test verification sometimes stalled or reported Cloudflare `300030`; a fresh page load resolved the final Partner/Requirement/Seller attempts. [Cloudflare classifies `300*` as generic challenge failure](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/); the precise environment/widget cause remains unproven. No challenge was manually solved, verification disabled or token injected. This is not proof of real production-site-key reliability. The standalone owner API/action path passed the real Neon module rehearsal, but was **not** exercised through protected Preview HTTP; no test-only UI or protection bypass was added to expose it.

After closing the UAT forms, one transaction removed only the exact requirement, seller submission and four named lead IDs above; cascading cleanup removed their four jobs. Original counts and complete-row fingerprints matched the pre-rehearsal baseline: leads 4 / `f084b5a39a28c718f743cb97d2da54a5`, requirements 0 / `d41d8cd98f00b204e9800998ecf8427e`, submissions 8 / `3158cb5279a521ac3f1a361461a91ee9`, lands 3 / `2a35320a9f519e89a613700e6ccf2166`, partners and attributions 0 / empty-set fingerprint. Final outbox count: **0**. No existing CRM row was reset, truncated or edited.

These are real application/database results with dummy human verification and disabled LINE. They do not establish real LINE acceptance or provider-scheduled recovery.

## Five-scenario real LINE UAT packet — prepared, not executed

Approved business destination name from earlier context: **Land Market Thai**, OA `@landmarketthai`. The cryptographic group-ID-to-name mapping still needs secure confirmation. The existing signed/no-send capture workflow was inspected read-only; its execution list currently shows **No executions found**, so no signed group-ID evidence was recovered. Do not infer a destination from a display name. Never change the active OA receiving webhook to obtain it.

An older Preview branch has a server-only `LINE_CHANNEL_ACCESS_TOKEN_UAT` setting; presence is not proof of validity, correct channel or push permission. No value was exported, logged or copied. Before sending, the owner must securely bind the approved test channel token and signed-verified group ID to the feature Preview under `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_NOTIFICATION_GROUP_ID`, and approve the bounded send window below. Production credentials are excluded.

| Scenario | Actual creation path / synthetic input | Expected committed state and alert |
|---|---|---|
| Buyer | `/contact` LeadForm or `POST /api/leads`, `lead_type=buyer`; name `LINE-UAT-<run>-BUYER`, synthetic valid-format phone, PDPA true | One buyer lead/job; Thai buyer label, fixed status and Preview admin link |
| Owner | Owner API/action, `lead_type=owner`, province ระยอง, size 3 rai, same synthetic naming and consent | One owner lead/job; owner label |
| Partner | `/become-partner` Server Action, synthetic name/phone and PDPA consent | One partner lead/job; applicant label; no second job when CRM later links a partner |
| Requirement | `/buy-request`, property type land, preferred location ระยอง, synthetic contact, PDPA true, public consent false | Requirement plus its buyer lead, one `buyer_requirement` job; no public projection |
| Seller | `/sell`: create/save a synthetic draft with land/sale, province ระยอง, 3 rai, ฿1,000,000, synthetic contact and PDPA consent, then submit | Draft transitions to pending review with owner lead; one `seller_submission` job; resubmit adds nothing |

Do not publish the synthetic property or demand. No identity documents, images, attachments, real customer contacts or free text are used in alerts. Test contact values are fixtures, never real customer data or a destination for outreach.

Proposed bounded live acceptance window, requiring explicit approval:

1. Confirm exact OA/test group, secure configuration and test observers; prove the outbox contains only this isolated run’s jobs. Preview remains protected.
2. Approve **at most five visible test alerts and seven LINE Push requests** for this batch. Stop on any unexpected response, destination or duplicate; keep delivery disabled until the approved window. No Production send is included.
3. Save five genuine synthetic business events. Use the persisted UUID from each first attempt. Record status, request ID, attempt count, sent timestamp and an observer’s group receipt confirmation; never log tokens or raw LINE response bodies.
4. For one event, use a test harness that drops the already-accepted response locally (simulated lost acknowledgement). The original LINE request is real, and the recovery attempt uses the identical UUID/body/destination. Expect a real 409 acceptance reference and only one visible alert for that event. This requires an explicitly prepared harness and approval; production worker behavior must not gain a fault-injection switch.
5. Replay one accepted request once with its unchanged retry key/body. Expect 409 with `x-line-accepted-request-id`, with no extra alert. This demonstrates platform deduplication within its documented window, not guaranteed recipient delivery. [LINE retry contract](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).
6. Keep 429/5xx/permanent-error injection in the controlled fake transport; do not deliberately exhaust the real LINE quota. Real timeout/outage behavior beyond the controlled lost-ack test remains unverified.
7. Disable delivery, drain active leases, reconcile all job/request IDs, then remove only exact synthetic records. Preserve sanitized acceptance evidence. Leave the receiving webhook and old workflow untouched.

This packet is a test plan, not live-send authorization. The seven-request ceiling must be enforced by the operator/harness; the normal worker’s eight-attempt-per-job limit is not a seven-request batch limiter.

## Zero website traffic and PR compatibility

Real Neon UAT proved that direct worker invocation recovers retries and leases with no new website submission. **A real provider-scheduled invocation during zero website traffic has not been tested**: no minute scheduler was activated, Vercel Hobby cannot supply it, and Vercel native Cron does not run on Preview. A local interval loop or manual invocation is not accepted as that proof.

After budget and a suitable isolated scheduling test are approved: set one job to retry through the controlled fault, stop website activity, observe an independent scheduler request after `available_at`, confirm the same retry key and terminal evidence, and record trigger/request timestamps plus zero user traffic. Also test one expired lease and at least two ticks without submissions. The owner must approve either a protected isolated test target with authorized scheduler access, or a separately scoped native-Cron rehearsal; neither is silently provisioned here.

PR #11 remains DRAFT at `c1d8796`, targeting `main`; PR #12 remains DRAFT targeting #11’s integration branch. The business persistence modules `src/lib/neon/mutations.ts` and `src/lib/neon/marketplace.ts` are unchanged by #12. The real Neon rehearsal therefore exercised the same business SQL used by #11 after adding the new trigger, and rollback/reapply left original data intact.

Release order: retain #11’s Production hold; rehearse all #11 schema prerequisites (zoning and public-write limiter) plus the additive outbox; review the combined application release; prepare credentials, commercial hosting and compute/scheduling; perform approved external UAT; then seek explicit Production approval. Do not deploy #12 onto an unmigrated DB and expect reliable enqueueing. Applying the outbox while #11’s old sender is running queues overlap jobs, so drain the old app/in-flight webhooks and quarantine/reconcile overlap IDs before native delivery. Rolling back to #11 can reactivate its old webhook path; reconcile accepted LINE events before allowing that sender. Neither PR was merged.

## Remaining owner decisions / release gates

| Gate | Status / required owner action |
|---|---|
| Exact hosting plan | **Closed:** Hobby Active, observed in authenticated billing UI |
| Commercial hosting | Approve Pro (or provide explicit written Vercel commercial exception); no upgrade performed |
| Continuous DB capacity | Approve adequate paid capacity/budget; Free allowance is insufficient for sustained minute polling |
| Isolated Neon migration/role/concurrency/rollback | **Closed:** nine checks passed on existing disposable branch |
| Preview DB credential transfer | **Approved and completed**, strictly feature-branch Preview scope |
| Preview application UAT | **Four browser flows passed** against real Neon, exact synthetic cleanup verified; worker-auth smoke passed. Standalone owner HTTP and production Turnstile reliability remain unverified |
| Test destination and token | Securely verify exact OA and signed group ID; authorize any credential transfer separately |
| Real LINE delivery | Approve the explicit five-alert/seven-request window, then observe actual responses/receipt |
| Independent zero-traffic recovery | Approve scheduler/capacity and isolated test access; actual scheduled evidence still required |
| Monitoring | Connect failure/backlog alerts and verify delivery to the operator; logs/counts alone are not an alert channel |
| Production | Explicit migration/deployment/cutover approval after the above; keep n8n and receiving webhook unchanged until separately approved cutover |

**Verdict: ENGINEERING GO / PRODUCTION NO-GO.** Real Neon evidence closes the database rehearsal blocker. Mocked LINE results and a READY Preview do not close real LINE delivery, paid-capacity, commercial eligibility or independent scheduling gates.
