import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { extractLineGroupIds, verifyLineSignature } from "./line/uat-webhook.ts";

test("LINE UAT signature validation rejects missing or altered body", () => {
  const raw = '{"destination":"test","events":[]}';
  const secret = "TEST_ONLY_CHANNEL_SECRET";
  const signature = createHmac("sha256", secret).update(raw).digest("base64");
  assert.equal(verifyLineSignature(raw, signature, secret), true);
  assert.equal(verifyLineSignature(raw + " ", signature, secret), false);
  assert.equal(verifyLineSignature(raw, "fake", secret), false);
  assert.equal(verifyLineSignature(raw, signature, undefined), false);
  assert.equal(verifyLineSignature(raw, null, secret), false);
});

test("LINE UAT extracts only well-formed group IDs, ignoring message content", () => {
  const id = "C0123456789abcdef0123456789abcdef";
  const payload = JSON.stringify({ events: [
    {type: "message", source: {type:"group",groupId:id,userId:"U_PRIVATE"}, message:{text:"DO NOT LOG"}},
    {type: "message", source: {type:"user",userId:"U_PRIVATE"}},
    {type: "message", source: {type:"group",groupId:"bad"}},
    {type: "message", source: {type:"group",groupId:id}}
  ]});
  assert.deepEqual(extractLineGroupIds(payload), [id]);
  assert.deepEqual(extractLineGroupIds("not-json"), []);
  assert.deepEqual(extractLineGroupIds('{"events":{}}'), []);
});
