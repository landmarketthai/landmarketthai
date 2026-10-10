import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const middlewareUrl = new URL("../middleware.ts", import.meta.url);
const misplacedRootUrl = new URL("../../middleware.ts", import.meta.url);

test("Next.js discovers Neon Auth middleware alongside src/app", () => {
  assert.ok(existsSync(new URL("../app/", import.meta.url)), "this project uses src/app");
  assert.ok(existsSync(middlewareUrl), "middleware must live in src/middleware.ts when using src/app");
  assert.equal(existsSync(misplacedRootUrl), false, "root middleware.ts is ignored by a src/app project");

  const code = readFileSync(middlewareUrl, "utf8");
  assert.match(code, /neon_auth_session_verifier/);
  assert.match(code, /return authMiddleware\(request\)/);
  assert.match(code, /pathname\.startsWith\("\/admin\/"\)/);
});
