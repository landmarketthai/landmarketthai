import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEAL_STAGES, LEAD_STATUSES, LEAD_TRANSITIONS, dealClosureContract } from "./contracts.ts";

const root = new URL("../../../", import.meta.url);
const file = (path: string) => new URL(path, root);
const source = (path: string) => readFileSync(file(path), "utf8");

test("admin lead, deal, and partner list/detail routes exist", () => {
  for (const route of ["leads", "leads/[id]", "deals", "deals/[id]", "partners", "partners/[id]"]) {
    assert.ok(existsSync(file(`src/app/admin/${route}/page.tsx`)), `missing /admin/${route}`);
  }
});

test("operations admin pages and APIs use the existing server-side admin guard", () => {
  for (const section of ["leads", "deals", "partners"]) {
    for (const path of [`src/app/admin/${section}/page.tsx`, `src/app/admin/${section}/[id]/page.tsx`, `src/app/api/admin/${section}/route.ts`, `src/app/api/admin/${section}/[id]/route.ts`]) {
      const text = source(path);
      assert.match(text, /getAdminUser\s*\(/, `${path} must call getAdminUser()`);
      if (/(?:POST|PATCH|PUT|DELETE)\s*=/.test(text)) {
        assert.match(text, /if\s*\(!?\s*admin\s*\)/, `${path} must reject non-admin mutations`);
      }
    }
  }
});

test("lead states and explicit terminal reopen semantics are fixed", () => {
  assert.deepEqual([...LEAD_STATUSES], ["new", "contacting", "qualified", "won", "lost"]);
  assert.deepEqual(LEAD_TRANSITIONS, {
    new: ["contacting", "qualified", "lost"], contacting: ["qualified", "lost"],
    qualified: ["won", "lost"], won: ["contacting"], lost: ["contacting"],
  });
});

test("deal closure and referral conversion follow stage; reopen clears closure", () => {
  assert.deepEqual([...DEAL_STAGES], ["open", "won", "lost"]);
  assert.deepEqual(dealClosureContract("won", "2026-10-03T00:00:00Z"), { stage: "won", status: "closed", closed_at: "2026-10-03T00:00:00Z", referral_converted: true });
  assert.deepEqual(dealClosureContract("lost", "2026-10-03T00:00:00Z"), { stage: "lost", status: "cancelled", closed_at: "2026-10-03T00:00:00Z", referral_converted: false });
  assert.deepEqual(dealClosureContract("open", "2026-10-03T00:00:00Z"), { stage: "open", status: "open", closed_at: null, referral_converted: false });
});

test("partner conversion, referral codes, commissions, and privacy have enforcement points", () => {
  const modules = ["src/lib/neon/operations.ts", "src/app/api/admin/leads/[id]/route.ts", "src/app/api/admin/deals/[id]/route.ts", "src/app/api/admin/partners/[id]/route.ts"];
  const present = modules.filter((path) => existsSync(file(path)));
  assert.ok(present.length, "operations integration must provide a source module");
  const joined = present.map(source).join("\n");
  assert.match(joined, /ON\s+CONFLICT|idempot|already converted/i, "lead conversion must be idempotent");
  assert.match(joined, /UNIQUE|unique|collision/i, "referral codes must be unique and collision-safe");
  assert.match(joined, /commission_paid[\s\S]*SUM|SUM[\s\S]*commission_paid/i, "total_paid must be recomputed from paid commissions");
  assert.match(joined, /override[\s\S]*(?:flag|event)|(?:flag|event)[\s\S]*override/i, "above-expected override needs explicit flag/event");
  assert.match(joined, /commission[\s\S]*(?:idempot|recomput|ON\s+CONFLICT)/i, "commission update must be idempotent/recomputed");
});

test("public buyer demand routes do not serialize contact details", () => {
  for (const path of ["src/app/buyer-demand/page.tsx", "src/app/buyer-demand/[slug]/page.tsx", "src/app/api/buyer-requirements/route.ts"]) {
    const text = source(path);
    assert.doesNotMatch(text, /\.phone\b|\.line_id\b|\bphone\s*[:,}]|\bline_id\s*[:,}]/i, `${path} must not expose buyer contact data`);
  }
});
