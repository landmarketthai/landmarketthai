import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MIGRATION_PATH = "../db/migrations/20261003_marketplace_operations_v1.sql";
const migration = () => readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8").replaceAll("\r\n", "\n");

test("leads gains the reminder-scheduling columns with claim indexes", () => {
  const sql = migration();
  for (const column of [
    "next_action_at timestamptz",
    "last_reminded_at timestamptz",
    "reminder_claim_token uuid",
    "reminder_claimed_at timestamptz",
    "reminder_claimed_for timestamptz",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(sql, /create index if not exists idx_leads_next_action\s+on leads \(next_action_at\) where next_action_at is not null;/);
  assert.match(sql, /create index if not exists idx_leads_reminder_claim\s+on leads \(reminder_claim_token\) where reminder_claim_token is not null;/);
});

test("deals pipeline columns exist, land_id/deal_value are relaxed via guarded DO blocks, status values are untouched", () => {
  const sql = migration();
  assert.match(sql, /create table if not exists deals/);
  // land_id / deal_value must never be declared "not null" directly on the base create table.
  const createDeals = sql.match(/create table if not exists deals \(([\s\S]*?)\);/)?.[1];
  assert.ok(createDeals, "deals base table definition found");
  assert.doesNotMatch(createDeals, /land_id\s+uuid\s+not null/);
  assert.doesNotMatch(createDeals, /deal_value\s+numeric\(18,2\)\s+not null/);
  assert.match(createDeals, /status\s+text\s+not null default 'in_progress'/);
  assert.doesNotMatch(sql, /deal_status_enum/);
  assert.match(sql, /alter table deals alter column stage set default 'qualified';/);

  // Guarded relaxation: must check is_nullable = 'NO' before dropping not null, for both columns.
  const guardBlock = sql.match(/do \$\$\nbegin\n(?:(?!^end \$\$;)[\s\S])*alter table deals alter column land_id drop not null;[\s\S]*?end \$\$;/m)?.[0];
  assert.ok(guardBlock, "land_id relaxation is guarded by an is_nullable check");
  assert.match(guardBlock, /column_name = 'land_id' and is_nullable = 'NO'/);
  assert.match(guardBlock, /column_name = 'deal_value' and is_nullable = 'NO'/);
  assert.match(guardBlock, /alter table deals alter column deal_value drop not null;/);

  for (const column of [
    "listing_ref text",
    "listing_title text",
    "expected_commission numeric\\(18,2\\)",
    "stage text default 'qualified'",
    "assigned_to text",
    "updated_at timestamptz not null default now\\(\\)",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  }
});

test("deals.stage check constraint is NOT VALID then VALIDATEd, idempotently, with the exact eight-value set", () => {
  const sql = migration();
  const block = sql.match(/alter table deals drop constraint if exists deals_stage_check;[\s\S]*?alter table deals validate constraint deals_stage_check;/)?.[0];
  assert.ok(block, "stage check constraint follows drop-if-exists -> add not valid -> validate");
  assert.match(block, /add constraint deals_stage_check\s*\n\s*check \(stage in \([\s\S]*?\)\)\s*\n\s*not valid;/);

  const stageValues = block.match(/check \(stage in \(([\s\S]*?)\)\)/)?.[1]
    ?.split(",")
    .map((v) => v.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(stageValues, [
    "qualified",
    "property_sent",
    "site_visit",
    "negotiation",
    "offer",
    "deposit",
    "won",
    "lost",
  ]);
});

test("deals partial indexes cover stage, buyer_lead_id, listing_ref, and the two buyer+land / buyer+listing uniqueness pairs", () => {
  const sql = migration();
  assert.match(sql, /create index if not exists idx_deals_stage on deals \(stage\);/);
  assert.match(sql, /create index if not exists idx_deals_buyer_lead\s+on deals \(buyer_lead_id\) where buyer_lead_id is not null;/);
  assert.match(sql, /create index if not exists idx_deals_listing_ref\s+on deals \(listing_ref\) where listing_ref is not null;/);
  assert.match(
    sql,
    /create unique index if not exists idx_deals_buyer_lead_land_unique\s+on deals \(buyer_lead_id, land_id\)\s+where buyer_lead_id is not null and land_id is not null;/
  );
  assert.match(
    sql,
    /create unique index if not exists idx_deals_buyer_lead_listing_ref_unique\s+on deals \(buyer_lead_id, listing_ref\)\s+where buyer_lead_id is not null and listing_ref is not null;/
  );
});

test("partners and referral_attributions keep their existing columns untouched; only indexes are added", () => {
  const sql = migration();
  assert.doesNotMatch(sql, /alter table partners\b/);
  assert.doesNotMatch(sql, /alter table referral_attributions\b/);
  assert.doesNotMatch(sql, /create table if not exists partners/);
  assert.doesNotMatch(sql, /create table if not exists referral_attributions/);
  assert.match(sql, /create index if not exists idx_partners_status on partners \(status\);/);
  assert.match(sql, /create index if not exists idx_referral_attributions_lead on referral_attributions \(lead_id\);/);
  assert.match(sql, /create index if not exists idx_referral_attributions_partner\s+on referral_attributions \(partner_id\) where partner_id is not null;/);
});

test("migration never drops a table and never deletes or truncates existing rows", () => {
  const sql = migration().toLowerCase();
  assert.doesNotMatch(sql, /drop\s+table/);
  assert.doesNotMatch(sql, /\btruncate\b/);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/);
  // The only UPDATE in this file must be the self-authored stage backfill, not a data rewrite.
  const updates = sql.match(/update\s+\w+\s+set[^;]*;/g) ?? [];
  assert.equal(updates.length, 1);
  assert.match(updates[0], /update deals set stage = 'qualified' where stage is null;/);
});

test("every structural statement is rerun-safe: CREATE TABLE/INDEX/TYPE use IF NOT EXISTS guards and every ADD CONSTRAINT is preceded by a DROP CONSTRAINT IF EXISTS", () => {
  const sql = migration();
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (/^create table\b/i.test(trimmed)) assert.match(trimmed, /create table if not exists/i, trimmed);
    if (/^create index\b|^create unique index\b/i.test(trimmed)) assert.match(trimmed, /create (unique )?index if not exists/i, trimmed);
    if (/^alter table .* add column\b/i.test(trimmed)) assert.match(trimmed, /add column if not exists/i, trimmed);
  }

  const addConstraints = [...sql.matchAll(/alter table (\w+) add constraint (\w+)/g)];
  for (const [, table, constraint] of addConstraints) {
    const dropGuard = new RegExp(`alter table ${table} drop constraint if exists ${constraint};`);
    assert.match(sql, dropGuard, `${constraint} on ${table} must be dropped-if-exists before being re-added`);
  }
});
