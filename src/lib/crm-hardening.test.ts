import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const concurrencySql = readFileSync(
  new URL("../../supabase/migrations/20260922000000_harden_crm_concurrency.sql", import.meta.url),
  "utf8",
);
const integritySql = readFileSync(
  new URL("../../supabase/migrations/20260922010000_lock_down_crm_integrity.sql", import.meta.url),
  "utf8",
);
const dealActions = readFileSync(
  new URL("../app/admin/deals/actions.ts", import.meta.url),
  "utf8",
);

test("database hardening installs concurrency and uniqueness guards", () => {
  assert.match(concurrencySql, /create unique index if not exists uq_deals_buyer_land/i);
  assert.match(concurrencySql, /create unique index if not exists uq_deals_buyer_listing_ref/i);
  assert.match(concurrencySql, /create or replace function claim_crm_automation_run/i);
  assert.match(concurrencySql, /status = 'running'.*interval '15 minutes'/is);
  assert.match(concurrencySql, /create or replace function claim_due_follow_up_leads/i);
  assert.match(concurrencySql, /for update skip locked/i);
});

test("financial mutations are implemented as atomic database functions", () => {
  assert.match(concurrencySql, /create or replace function create_deal_with_commissions/i);
  assert.match(concurrencySql, /create or replace function update_deal_stage_atomic/i);
  assert.match(concurrencySql, /create or replace function update_commission_atomic/i);
  assert.match(concurrencySql, /exception when unique_violation/i);
});

test("owner property creation is atomic and direct public writes are closed", () => {
  assert.match(integritySql, /create or replace function create_property_draft_from_owner_lead/i);
  assert.match(integritySql, /from leads l[\s\S]*for update/i);
  assert.match(integritySql, /drop policy if exists "anon insert leads" on leads/i);
  assert.match(integritySql, /revoke insert on table leads, lead_attachments, events from anon, authenticated/i);
});

test("deal creation recovers a validated referral partner when attribution telemetry is missing", () => {
  assert.match(dealActions, /async function resolveActivePartnerId/);
  assert.match(dealActions, /\.eq\("referral_code", referralCode\)[\s\S]*\.eq\("status", "active"\)/);
  assert.match(dealActions, /buyerAttribution\?\.partner_id \?\? await resolveActivePartnerId\(db, buyerReferralCode\)/);
  assert.match(dealActions, /ownerLeadResult\.data\?\.referral_code/);
  assert.match(dealActions, /ownerPartnerId = sourceResult\.data\?\.partner_id \?\? await resolveActivePartnerId\(db, ownerReferralCode\)/);
});

test("operational RPCs are restricted to the service role", () => {
  assert.match(concurrencySql, /revoke all on function claim_crm_automation_run\(text, date\) from public, anon, authenticated/i);
  assert.match(concurrencySql, /grant execute on function claim_crm_automation_run\(text, date\) to service_role/i);
  assert.match(concurrencySql, /revoke all on function update_commission_atomic\(uuid, text, numeric, numeric\) from public, anon, authenticated/i);
  assert.match(concurrencySql, /grant execute on function update_commission_atomic\(uuid, text, numeric, numeric\) to service_role/i);
  assert.match(integritySql, /revoke all on function create_property_draft_from_owner_lead[\s\S]*from public, anon, authenticated/i);
  assert.match(integritySql, /grant execute on function create_property_draft_from_owner_lead[\s\S]*to service_role/i);
});
