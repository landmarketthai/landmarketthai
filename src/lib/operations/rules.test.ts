import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionLead, DEAL_STAGES, DEAL_STAGE_LABELS, dealStatusForStage, fromBangkokInput, isLeadOverdue,
  LEAD_STATUSES, LEAD_STATUS_LABELS, resolveDealState, summarizeDeals, toBangkokInput,
} from "./rules.ts";

test("lead transitions follow the CRM rules and ended leads need an explicit reopen", () => {
  const allowed = new Set([
    "new>contacting", "new>qualified", "new>lost",
    "contacting>qualified", "contacting>lost",
    "qualified>won", "qualified>lost", "qualified>contacting",
  ]);
  for (const from of LEAD_STATUSES) {
    for (const to of LEAD_STATUSES) {
      if (from === to) { assert.equal(canTransitionLead(from, to), true); continue; }
      const reopen = (from === "won" || from === "lost") && to === "contacting";
      assert.equal(canTransitionLead(from, to), allowed.has(`${from}>${to}`), `${from}>${to}`);
      assert.equal(canTransitionLead(from, to, true), allowed.has(`${from}>${to}`) || reopen, `${from}>${to} reopen`);
    }
  }
  assert.equal(canTransitionLead("new", "won", true), false);
  assert.equal(canTransitionLead("lost", "qualified", true), false);
});

test("every status and stage has a Thai label", () => {
  for (const status of LEAD_STATUSES) assert.match(LEAD_STATUS_LABELS[status], /[฀-๿]/);
  assert.deepEqual(DEAL_STAGES, ["qualified", "property_sent", "site_visit", "negotiation", "offer", "deposit", "won", "lost"]);
  for (const stage of DEAL_STAGES) assert.match(DEAL_STAGE_LABELS[stage], /[฀-๿]/);
});

test("deal stage drives status and closed_at", () => {
  assert.equal(dealStatusForStage("won"), "closed");
  assert.equal(dealStatusForStage("lost"), "cancelled");
  assert.equal(dealStatusForStage("offer"), "in_progress");
  const open = { stage: "negotiation" as const, status: "in_progress" as const };
  assert.deepEqual(resolveDealState(open, { stage: "won" }), { ok: true, stage: "won", status: "closed", closedAt: "set" });
  assert.deepEqual(resolveDealState(open, { stage: "lost" }), { ok: true, stage: "lost", status: "cancelled", closedAt: "set" });
  assert.deepEqual(resolveDealState(open, { stage: "offer" }), { ok: true, stage: "offer", status: "in_progress", closedAt: "keep" });
  assert.deepEqual(resolveDealState(open, {}), { ok: true, stage: "negotiation", status: "in_progress", closedAt: "keep" });
  // Status alone maps to the terminal stage.
  assert.deepEqual(resolveDealState(open, { status: "closed" }), { ok: true, stage: "won", status: "closed", closedAt: "set" });
  assert.deepEqual(resolveDealState(open, { status: "cancelled" }), { ok: true, stage: "lost", status: "cancelled", closedAt: "set" });
  // Reopen clears closed_at; editing a still-won deal keeps the original close time.
  const won = { stage: "won" as const, status: "closed" as const };
  assert.deepEqual(resolveDealState(won, { stage: "deposit" }), { ok: true, stage: "deposit", status: "in_progress", closedAt: "clear" });
  assert.deepEqual(resolveDealState(won, {}), { ok: true, stage: "won", status: "closed", closedAt: "keep" });
  assert.deepEqual(resolveDealState(won, { stage: "lost" }), { ok: true, stage: "lost", status: "cancelled", closedAt: "set" });
  // Contradictions and ambiguous reopen are rejected.
  assert.equal(resolveDealState(open, { stage: "won", status: "in_progress" }).ok, false);
  assert.equal(resolveDealState(open, { stage: "offer", status: "cancelled" }).ok, false);
  assert.equal(resolveDealState(won, { status: "in_progress" }).ok, false);
  assert.equal(resolveDealState({ stage: "offer", status: "cancelled" }, { status: "in_progress" }).ok, false);
});

test("overdue ignores ended leads and empty dates", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(isLeadOverdue({ status: "contacting", next_action_at: "2026-10-02T00:00:00Z" }, now), true);
  assert.equal(isLeadOverdue({ status: "contacting", next_action_at: "2026-10-04T00:00:00Z" }, now), false);
  assert.equal(isLeadOverdue({ status: "won", next_action_at: "2026-10-02T00:00:00Z" }, now), false);
  assert.equal(isLeadOverdue({ status: "new", next_action_at: null }, now), false);
});

test("Bangkok datetime-local round trips", () => {
  assert.equal(toBangkokInput("2026-10-03T03:30:00.000Z"), "2026-10-03T10:30");
  assert.equal(fromBangkokInput("2026-10-03T10:30"), "2026-10-03T03:30:00.000Z");
  assert.equal(fromBangkokInput(""), null);
  assert.equal(toBangkokInput(null), "");
});

test("deal totals use real values only", () => {
  const summary = summarizeDeals([
    { stage: "offer", deal_value: 100, expected_commission: 3 },
    { stage: "offer", deal_value: null, expected_commission: null },
    { stage: "won", deal_value: 50, expected_commission: 2 },
    { stage: "lost", deal_value: 999, expected_commission: 9 },
  ]);
  assert.equal(summary.byStage.offer.count, 2);
  assert.equal(summary.byStage.offer.value, 100);
  assert.deepEqual(summary.open, { count: 2, value: 100, commission: 3 });
  assert.deepEqual(summary.won, { count: 1, value: 50, commission: 2 });
});
