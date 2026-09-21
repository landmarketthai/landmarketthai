import assert from "node:assert/strict";
import test from "node:test";
import { listingStatusForDealStages } from "@/lib/property-pipeline";

test("never auto-activates draft or archived inventory", () => {
  assert.equal(listingStatusForDealStages("draft", ["deposit"]), "draft");
  assert.equal(listingStatusForDealStages("archived", ["won"]), "archived");
});

test("active inventory follows reservation and won stages", () => {
  assert.equal(listingStatusForDealStages("active", ["deposit"]), "reserved");
  assert.equal(listingStatusForDealStages("active", ["won"]), "sold");
});

test("reserved inventory returns active when no deposit or won remains", () => {
  assert.equal(listingStatusForDealStages("reserved", ["negotiation", "lost"]), "active");
});
