import assert from "node:assert/strict";
import test from "node:test";
import {
  commissionStatusAllowedForDealStage,
  dealStageRequiresValue,
  dealStatusForStage,
  isTerminalDealStage,
} from "@/lib/deal-pipeline";

test("maps active stages to in_progress", () => {
  for (const stage of ["qualified", "property_sent", "site_visit", "negotiation", "offer", "deposit"] as const) {
    assert.equal(dealStatusForStage(stage), "in_progress");
    assert.equal(isTerminalDealStage(stage), false);
  }
});

test("maps won and lost to terminal statuses", () => {
  assert.equal(dealStatusForStage("won"), "closed");
  assert.equal(dealStatusForStage("lost"), "cancelled");
  assert.equal(isTerminalDealStage("won"), true);
  assert.equal(isTerminalDealStage("lost"), true);
});

test("requires a real deal value before won", () => {
  assert.equal(dealStageRequiresValue("won"), true);
  assert.equal(dealStageRequiresValue("deposit"), false);
});

test("only allows payable or paid commission after won", () => {
  assert.equal(commissionStatusAllowedForDealStage("negotiation", "approved"), true);
  assert.equal(commissionStatusAllowedForDealStage("negotiation", "payable"), false);
  assert.equal(commissionStatusAllowedForDealStage("deposit", "paid"), false);
  assert.equal(commissionStatusAllowedForDealStage("won", "payable"), true);
  assert.equal(commissionStatusAllowedForDealStage("won", "paid"), true);
});
