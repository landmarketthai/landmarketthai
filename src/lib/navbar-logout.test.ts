import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navbar = readFileSync(new URL("../components/layout/Navbar.tsx", import.meta.url), "utf8");
const authProvider = readFileSync(new URL("../components/auth/AuthProvider.tsx", import.meta.url), "utf8");

test("desktop and mobile logout revalidate the session with a hard navigation", () => {
  assert.match(authProvider, /useEffect\(\(\) => \{/);
  assert.match(navbar, /async function signOutAndReload\(\)/);
  assert.match(navbar, /await authClient\.signOut\(\)/);
  assert.match(navbar, /if \(result\.error\) throw/);
  assert.match(navbar, /window\.location\.replace\("\/login"\)/);
  assert.doesNotMatch(navbar, /router\.refresh\(\)/);
  assert.match(navbar, /await signOutAndReload\(\)/);
  assert.equal((navbar.match(/await signOutAndReload\(\)/g) ?? []).length, 2);
});

test("logout does not silently ignore server errors or allow repeat clicks", () => {
  assert.match(navbar, /disabled=\{logoutPending\}/);
  assert.equal((navbar.match(/disabled=\{logoutPending\}/g) ?? []).length, 2);
  assert.match(navbar, /role="alert"/);
  assert.match(navbar, /ออกจากระบบไม่สำเร็จ/);
});
