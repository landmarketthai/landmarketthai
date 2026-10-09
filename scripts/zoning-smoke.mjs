#!/usr/bin/env node
// Post-deploy zoning smoke test. Read-only GET requests against BASE_URL. Never writes, never logs in.
//   BASE_URL=https://<deployment> [SMOKE_SLUG=101-rai-kabin-buri] [SMOKE_FORBIDDEN_TEXT="text1|text2"] node scripts/zoning-smoke.mjs
//   node scripts/zoning-smoke.mjs --self-test     (assertion functions on fixture strings; no network)
// Exit 0 = all checks passed, 1 = failure, 2 = usage error.

const EDITOR_MARKERS = ["จัดการข้อมูลผังเมือง", "บันทึกข้อมูลผังเมือง", "zoning_info"];

export function checkNoNullRai(html) {
  return /(^|[^\p{L}\p{N}])null\s*ไร่/u.test(html) ? 'page contains "null ไร่"' : null;
}
export function checkMetaDescription(html) {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  if (!m) return "meta description missing";
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c && c[1].trim().length >= 20 ? null : "meta description empty or too short";
}
export function checkForbidden(html, forbidden) {
  const hit = forbidden.filter((t) => t && html.includes(t));
  return hit.length ? `forbidden text present: ${hit.map((t) => JSON.stringify(t)).join(", ")}` : null;
}
export function checkNoEditorLeak(status, headers, body) {
  if ([301, 302, 303, 307, 308].includes(status)) {
    const loc = headers.get?.("location") ?? headers.location ?? "";
    return /login|sign-?in|auth/i.test(loc) ? null : `redirects to unexpected location: ${loc}`;
  }
  if ([401, 403, 404].includes(status)) return null;
  if (status === 200) {
    const leaked = EDITOR_MARKERS.filter((m) => body.includes(m));
    return leaked.length ? `unauthenticated 200 contains editor content: ${leaked.join(", ")}` : "unauthenticated 200 (expected redirect/401/403/404)";
  }
  return `unexpected status ${status}`;
}
export function checkSearchJson(text, forbidden = []) {
  let data;
  try { data = JSON.parse(text); } catch { return "search response is not JSON"; }
  if (!data || !Array.isArray(data.properties)) return "search response has no properties array";
  // Admin-reviewed evidence may be public, so only known owner-submitted text (SMOKE_FORBIDDEN_TEXT) counts as a leak.
  const exposed = data.properties.flatMap((row) => [row?.zoning_info?.source, row?.zoning_info?.evidence_url]).filter(Boolean).join("\n");
  const leak = checkForbidden(exposed, forbidden);
  if (leak) return `search response exposes owner zoning source/evidence: ${leak}`;
  return checkNoNullRai(text);
}

function selfTest() {
  const good = '<html><head><meta name="description" content="ที่ดินอุตสาหกรรม 101 ไร่ กบินทร์บุรี พร้อมข้อมูลผังเมือง"></head><body>101 ไร่</body></html>';
  const cases = [
    ["null ไร่ detected", checkNoNullRai("ขนาด null ไร่") !== null],
    ["null ไร่ absent ok", checkNoNullRai(good) === null],
    ["meta ok", checkMetaDescription(good) === null],
    ["meta missing", checkMetaDescription("<html></html>") !== null],
    ["meta empty", checkMetaDescription('<meta name="description" content="">') !== null],
    ["forbidden hit", checkForbidden("abc secret-url def", ["secret-url"]) !== null],
    ["forbidden miss", checkForbidden("abc", ["secret-url"]) === null],
    ["forbidden empty list", checkForbidden("abc", []) === null],
    ["editor redirect to login ok", checkNoEditorLeak(307, new Headers({ location: "/login?next=/manage/zoning" }), "") === null],
    ["editor 404 ok", checkNoEditorLeak(404, new Headers(), "") === null],
    ["editor 401 ok", checkNoEditorLeak(401, new Headers(), "") === null],
    ["editor 200 with editor content fails", checkNoEditorLeak(200, new Headers(), "<h1>จัดการข้อมูลผังเมือง</h1>") !== null],
    ["editor plain 200 fails", checkNoEditorLeak(200, new Headers(), "<html></html>") !== null],
    ["editor 500 fails", checkNoEditorLeak(500, new Headers(), "") !== null],
    ["editor redirect elsewhere fails", checkNoEditorLeak(302, new Headers({ location: "/" }), "") !== null],
    ["search ok", checkSearchJson('{"properties":[]}') === null],
    ["search not json", checkSearchJson("<html>") !== null],
    ["search leaks owner evidence behind zones", checkSearchJson('{"properties":[{"zoning_info":{"zones":[{"color":"green"}],"status":"owner_reported","source":"x","evidence_url":"https://owner.example/a"}}]}', ["https://owner.example/a"]) !== null],
    ["search allows reviewed public source", checkSearchJson('{"properties":[{"zoning_info":{"zones":[{"color":"green"}],"source":"admin note","evidence_url":""}}]}', ["https://owner.example/a"]) === null],
  ];
  const failed = cases.filter(([, ok]) => !ok);
  for (const [name, ok] of cases) console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  console.log(failed.length ? `${failed.length} self-test failure(s)` : `self-test passed (${cases.length})`);
  process.exit(failed.length ? 1 : 0);
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const base = (process.env.BASE_URL ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) {
    console.error("BASE_URL is required (e.g. BASE_URL=https://preview.example.vercel.app). Refusing to run without it.");
    process.exit(2);
  }
  const slug = process.env.SMOKE_SLUG || "101-rai-kabin-buri";
  const forbidden = (process.env.SMOKE_FORBIDDEN_TEXT ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const results = [];
  const record = (name, problem) => { results.push([name, problem]); console.log(`${problem ? "FAIL" : "ok  "} ${name}${problem ? ` - ${problem}` : ""}`); };
  const get = async (path, opts = {}) => {
    const res = await fetch(base + path, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20000), ...opts });
    return { status: res.status, headers: res.headers, body: await res.text() };
  };
  const guard = async (name, fn) => { try { record(name, await fn()); } catch (e) { record(name, `request error: ${e.message}`); } };

  await guard("GET / returns 200, no 'null ไร่'", async () => {
    const r = await get("/");
    return r.status !== 200 ? `status ${r.status}` : checkNoNullRai(r.body) ?? checkForbidden(r.body, forbidden);
  });
  await guard(`GET /property/${slug} returns 200 with clean content and meta description`, async () => {
    const r = await get(`/property/${encodeURIComponent(slug)}`);
    if (r.status !== 200) return `status ${r.status}`;
    return checkNoNullRai(r.body) ?? checkMetaDescription(r.body) ?? checkForbidden(r.body, forbidden);
  });
  await guard("GET /api/properties/search returns 200 JSON, no evidence leak", async () => {
    const r = await get("/api/properties/search?limit=5");
    return r.status !== 200 ? `status ${r.status}` : checkSearchJson(r.body, forbidden) ?? checkForbidden(r.body, forbidden);
  });
  await guard("GET /manage/zoning unauthenticated does not expose the editor", async () => {
    const r = await get("/manage/zoning");
    return checkNoEditorLeak(r.status, r.headers, r.body);
  });

  const failed = results.filter(([, p]) => p);
  console.log(failed.length ? `${failed.length} of ${results.length} checks FAILED` : `all ${results.length} checks passed`);
  console.log("Reminder: this does not test the authenticated admin save. A real authorised Google OAuth admin must verify /manage/zoning save manually.");
  process.exit(failed.length ? 1 : 0);
}

main();
