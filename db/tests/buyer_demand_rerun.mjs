// Opt-in DB UAT only: node db/tests/buyer_demand_rerun.mjs against an isolated branch.
// Applies the migration twice and lifecycle assertions in ONE rolled-back transaction.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to an isolated UAT branch");
const sql = neon(process.env.DATABASE_URL);
function statements(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8").replace(/^\s*--[^\n]*$/gm, "");
  const result = [];
  let statement = "";
  for (const token of source.match(/'(?:''|[^'])*'|[^';]+|[';]/g) ?? []) {
    if (token === "'") throw new Error("Unterminated SQL string");
    if (token === ";") {
      if (!/^(begin|commit|rollback)$/i.test(statement.trim())) result.push(statement.trim());
      statement = "";
    } else statement += token;
  }
  return result.filter(Boolean);
}
const migration = statements("../migrations/20261001_buyer_demand_review.sql");
const checks = statements("./buyer_demand_lifecycle.sql");
// A deliberate final exception makes rollback mandatory, including for the HTTP driver.
try {
  await sql.transaction([...migration, ...checks, ...migration, ...checks,
    "do 'begin raise exception ''Buyer UAT rollback complete''; end;'"]
    .map((statement) => sql.query(statement)));
  throw new Error("UAT transaction unexpectedly committed");
} catch (error) {
  if (error.message !== "Buyer UAT rollback complete") throw error;
}
console.log("Buyer Demand migration rerun and lifecycle checks passed, transaction rolled back.");
