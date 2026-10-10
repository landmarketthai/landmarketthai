import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { safeNextPath } from "./safe-redirect.ts";

const ORIGIN = "https://landmarketthai.com";
// The App Router resolves router.replace(href) with new URL(href, location.href) and hard-navigates when the origin differs.
const landsOn = (href: string) => new URL(href, `${ORIGIN}/login?next=x`);

const attacks = [
  "/\\evil.example", "/\\/evil.example", "//evil.example", "///evil.example", "/.//evil.example", "/./\\evil.example",
  "/%5Cevil.example", "/%5cevil.example", "/%2F%2Fevil.example", "/%2fevil.example", "/%2e%2e%2f%2fevil.example",
  "/a/../\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", " /evil", "/ /evil.example",
  "/\u0000/evil.example", "/%00/x", "/%0a/x", "/。evil.example", "/／／evil.example", "/∕∕evil.example",
  "/​/evil.example", "/ที่ดิน", "https://evil.example", "http:/evil.example", "javascript:alert(1)", "evil.example",
  "\\\\evil.example", "", "/%", "/%E0%A4%A", "/" + "a".repeat(2048), "/login", "/login/", "/login?next=//evil.example",
];
const legit: [string, string][] = [
  ["/", "/"],
  ["/manage/zoning", "/manage/zoning"],
  ["/admin/leads?status=new&page=2", "/admin/leads?status=new&page=2"],
  ["/admin/deals/abc-123#notes", "/admin/deals/abc-123#notes"],
  ["/land?q=a%2Fb&province=%E0%B8%A3%E0%B8%B0", "/land?q=a%2Fb&province=%E0%B8%A3%E0%B8%B0"],
  ["/property/%E0%B8%97%E0%B8%B5%E0%B9%88", "/property/%E0%B8%97%E0%B8%B5%E0%B9%88"],
  ["/admin/./leads", "/admin/leads"],
  ["/manage/zoning?next=//evil.example", "/manage/zoning?next=//evil.example"],
];

test("old prefix check accepted '/\\\\evil.example', which the browser resolves off-site", () => {
  const oldCheck = (value: string) => value.startsWith("/") && !value.startsWith("//");
  assert.equal(oldCheck("/\\evil.example"), true);
  assert.equal(landsOn("/\\evil.example").origin, "https://evil.example");
});

test("safeNextPath hard-fails every off-site, encoded, whitespace, control and Unicode trick to '/'", () => {
  for (const value of attacks) assert.equal(safeNextPath(value), "/", JSON.stringify(value));
  for (const value of [null, undefined, 42, ["/admin"]]) assert.equal(safeNextPath(value), "/");
});

test("safeNextPath keeps legitimate same-origin paths with query and hash", () => {
  for (const [input, expected] of legit) assert.equal(safeNextPath(input), expected, input);
});

test("modeled navigation: every input, raw or via ?next= round trip, lands on our origin with a single leading slash", () => {
  for (const value of [...attacks, ...legit.map(([input]) => input)]) {
    const fromQuery = new URL(`${ORIGIN}/login?next=${encodeURIComponent(value)}`).searchParams.get("next");
    for (const candidate of [value, fromQuery]) {
      const next = safeNextPath(candidate);
      assert.equal(landsOn(next).origin, ORIGIN, JSON.stringify(candidate));
      assert.equal(new URL(`${ORIGIN}${next}`).origin, ORIGIN, "OAuth callbackURL");
      assert.match(next, /^\/(?![\/\\])/);
    }
  }
});

// Runs the real LoginClient with hooks/JSX stubbed: proves both the logged-in redirect and the OAuth callbackURL.
async function runLoginClient(next: string | null, user: unknown) {
  const source = readFileSync(new URL("../app/login/LoginClient.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const replaced: string[] = [];
  const callbacks: string[] = [];
  const elements: { type: unknown; props: Record<string, unknown> }[] = [];
  const element = (type: unknown, props: Record<string, unknown>) => { elements.push({ type, props }); return { type, props }; };
  const params = new URLSearchParams(next === null ? "" : `next=${encodeURIComponent(next)}`);
  const modules: Record<string, unknown> = {
    react: { useState: (initial: unknown) => [initial, () => {}], useEffect: (effect: () => void) => effect() },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "next/navigation": { useRouter: () => ({ replace: (href: string) => replaced.push(href) }), useSearchParams: () => params },
    "next/image": "Image",
    "next/link": "Link",
    "@/lib/auth/client": { authConfigured: true, authClient: { signIn: { social: async ({ callbackURL }: { callbackURL: string }) => { callbacks.push(callbackURL); return {}; } } } },
    "@/components/auth/AuthProvider": { useAuth: () => ({ user, loading: false }) },
    "@/lib/safe-redirect": { safeNextPath },
  };
  const exports: { default?: () => unknown } = {};
  runInNewContext(compiled.outputText, {
    exports, console, window: { location: { origin: ORIGIN } },
    require: (name: string) => { assert.ok(Object.hasOwn(modules, name), `Unmocked dependency: ${name}`); return modules[name]; },
  });
  exports.default!();
  const button = elements.find((el) => el.type === "button" && typeof el.props.onClick === "function");
  await (button!.props.onClick as () => Promise<void>)();
  return { replaced, callbacks };
}

test("LoginClient: logged-in redirect and Google callbackURL never leave the origin", async () => {
  for (const value of attacks) {
    const { replaced, callbacks } = await runLoginClient(value, { id: "u1" });
    assert.deepEqual(replaced, ["/"], JSON.stringify(value));
    assert.deepEqual(callbacks, [`${ORIGIN}/`], JSON.stringify(value));
  }
  for (const [input, expected] of legit) {
    const { replaced, callbacks } = await runLoginClient(input, { id: "u1" });
    assert.deepEqual(replaced, [expected]);
    assert.deepEqual(callbacks, [`${ORIGIN}${expected}`]);
    assert.equal(landsOn(replaced[0]).origin, ORIGIN);
  }
  const anonymous = await runLoginClient("/manage/zoning", null);
  assert.deepEqual(anonymous.replaced, [], "no redirect before login");
  assert.deepEqual(anonymous.callbacks, [`${ORIGIN}/manage/zoning`]);
  assert.deepEqual((await runLoginClient(null, { id: "u1" })).replaced, ["/"]);
});

test("legacy /auth/callback redirects only to same-origin safe paths", async () => {
  const source = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: { GET?: (request: Request) => Promise<URL> } = {};
  runInNewContext(compiled.outputText, {
    exports, URL,
    require: (name: string) => ({ "next/server": { NextResponse: { redirect: (target: URL) => target } }, "@/lib/safe-redirect": { safeNextPath } })[name],
  });
  for (const value of attacks) {
    const target = await exports.GET!(new Request(`${ORIGIN}/auth/callback?next=${encodeURIComponent(value)}`));
    assert.equal(target.href, `${ORIGIN}/`, JSON.stringify(value));
  }
  const target = await exports.GET!(new Request(`${ORIGIN}/auth/callback?next=${encodeURIComponent("/manage/zoning?tab=a#b")}`));
  assert.equal(target.href, `${ORIGIN}/manage/zoning?tab=a#b`);
});
