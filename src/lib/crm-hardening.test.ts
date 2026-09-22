import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260922000000_harden_crm_concurrency.sql", import.meta.url),
  "utf8",
);

test("database hardening installs concurrency and uniqueness guards", () => {
  assert.match(sql, /create unique index if not exists uq_deals_buyer_land/i);
  assert.match(sql, /create unique index if not exists uq_deals_buyer_listing_ref/i);
  assert.match(sql, /create or replace function claim_crm_automation_run/i);
  assert.match(sql, /create or replace function claim_due_follow_up_leads/i);
  assert.match(sql, /for update skip locked/i);
});

test("financial mutations are implemented as atomic database functions", () => {
  assert.match(sql, /create or replace function create_deal_with_commissions/i);
  assert.match(sql, /create or replace function update_deal_stage_atomic/i);
  assert.match(sql, /create or replace function update_commission_atomic/i);
  assert.match(sql, /exception when unique_violation/i);
});

test("operational RPCs are restricted to the service role", () => {
  assert.match(sql, /revoke all on function claim_crm_automation_run\(text, date\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function claim_crm_automation_run\(text, date\) to service_role/i);
  assert.match(sql, /revoke all on function update_commission_atomic\(uuid, text, numeric, numeric\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function update_commission_atomic\(uuid, text, numeric, numeric\) to service_role/i);
});
