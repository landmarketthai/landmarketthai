import assert from "node:assert/strict";
import test from "node:test";
import { leadSourceFromUrl, referralCodeFromUrl, trackingSourceFromUrl } from "@/lib/lead-attribution";

test("captures referral code from ref query", () => {
  assert.equal(referralCodeFromUrl("https://landmarketthai.com/property/37-rai-eec-rayong?ref=A123"), "A123");
});

test("captures only approved UTM fields in lead source", () => {
  assert.equal(
    leadSourceFromUrl("https://landmarketthai.com/contact?utm_source=facebook&utm_campaign=eec&secret=drop-me&ref=A123"),
    "/contact?utm_source=facebook&utm_campaign=eec",
  );
});

test("falls back to pathname when there is no UTM", () => {
  assert.equal(leadSourceFromUrl("/submit-land?ref=A123"), "/submit-land");
  assert.equal(trackingSourceFromUrl("/submit-land?ref=A123"), undefined);
});

test("returns campaign source only when approved UTM fields exist", () => {
  assert.equal(
    trackingSourceFromUrl("/property/37-rai-eec-rayong?utm_source=facebook&utm_medium=cpc&ref=A123"),
    "/property/37-rai-eec-rayong?utm_source=facebook&utm_medium=cpc",
  );
});
