// Run against `npm run start -- --port 3101` built without database credentials.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3101";
const rayong = 'href="/property/37-rai-eec-rayong"';
const kabin = 'href="/property/101-rai-kabin-buri"';
async function html(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  return response.text();
}

const all = await html("/land");
assert.ok(all.includes(rayong) && all.includes(kabin));
assert.equal(all.includes("✓ Verified Property"), false);
const filtered = await html("/land?province=rayong&type=industrial&q=EEC&min_size=37&max_size=37&min_price=2300000&max_price=2300000&zoning=purple&eec=true");
assert.ok(filtered.includes(rayong));
assert.equal(filtered.includes(kabin), false);
const large = await html("/land?min_size=38&eec=false");
assert.ok(large.includes(kabin));
assert.equal(large.includes(rayong), false);
const literal = await html("/land?q=*");
assert.equal(literal.includes(rayong) || literal.includes(kabin), false);
assert.ok((await html("/land?min_size=40&max_size=20")).includes('role="alert"'));
const buyer = await html("/buy-request");
assert.ok(buyer.includes('name="phone"') && buyer.includes('name="size_min_rai"'));
const sell = await fetch(`${base}/sell`, { redirect: "manual" });
assert.ok([307, 308].includes(sell.status));
assert.equal(sell.headers.get("location"), "/submit-land");
const searches = await fetch(`${base}/saved-searches`, { redirect: "manual" });
assert.equal(searches.status, 307);
assert.ok(searches.headers.get("location").includes("/login?next=/saved-searches"));
const foreignWrite = await fetch(`${base}/api/saved-searches`, { method: "POST", headers: { origin: "https://evil.test", "Content-Type": "application/json" }, body: "{}" });
assert.equal(foreignWrite.status, 403);
const localWrite = await fetch(`${base}/api/saved-searches`, { method: "POST", headers: { origin: base, "Content-Type": "application/json" }, body: "{}" });
assert.equal(localWrite.status, 503); // No configured database must never report a saved search.
console.log("Marketplace production smoke: filters, buyer/sell routes, badges, private searches and origin checks passed.");
