// Run against a local build/start without DATABASE_URL; no buyer-demand fixtures required.
// Set NEON_AUTH_COOKIE_SECRET (at least 32 characters) for both build and start.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3101";
const rayong = 'href="/property/37-rai-eec-rayong"';
const kabin = 'href="/property/101-rai-kabin-buri"';
const sold = 'href="/property/109-rai-eec-rayong"';
let checks = 0;
async function html(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  checks++;
  return response.text();
}

const all = await html("/land");
assert.ok(all.includes(rayong) && all.includes(kabin));
assert.equal(all.includes(sold), false);
assert.equal(all.includes("✓ Verified Property"), false);
const filtered = await html("/land?province=rayong&type=industrial&q=EEC&min_size=36.91825&max_size=36.91825&min_price=2300000&max_price=2300000&zoning=purple&eec=true");
assert.ok(filtered.includes(rayong));
assert.equal(filtered.includes(kabin), false);
const large = await html("/land?min_size=38&eec=false");
assert.ok(large.includes(kabin));
assert.equal(large.includes(rayong), false);
const literal = await html("/land?q=*");
assert.equal(literal.includes(rayong) || literal.includes(kabin), false);
assert.ok((await html("/land?min_size=40&max_size=20")).includes('role="alert"'));
const buyer = await html("/buy-request");
assert.ok(buyer.includes('name="phone"') && buyer.includes('name="min_size_rai"'));
assert.ok(buyer.includes('name="consent_pdpa"') && buyer.includes('name="consent_public"'));
const demands = await html("/buyer-demand");
assert.doesNotMatch(demands, /href="\/buyer-demand\/[^"?]+"/);
if (demands.includes("โหลดรายการความต้องการซื้อไม่ได้ในขณะนี้")) {
  assert.ok(demands.includes('role="alert"') && demands.includes('href="/buyer-demand?page=1"'));
} else {
  assert.ok(demands.includes("ยังไม่มีความต้องการซื้อที่เปิดเผยต่อสาธารณะในขณะนี้"));
  assert.ok(demands.includes('href="/buy-request"'));
}
const sell = await html("/sell");
assert.ok(sell.includes("ฝากขายทรัพย์") && sell.includes("บันทึกแบบร่าง"));
const legacySell = await fetch(`${base}/submit-land`, { redirect: "manual" });
assert.ok([307, 308].includes(legacySell.status));
assert.equal(legacySell.headers.get("location"), "/sell");
checks++;
assert.ok((await html("/saved-searches")).includes("เบราว์เซอร์นี้"));
const search = await html("/search");
assert.ok(search.includes(rayong) && search.includes(kabin));
assert.equal(search.includes(sold), false);
const history = await html("/search?history=1");
assert.ok(history.includes(sold));
assert.equal(history.includes(rayong) || history.includes(kabin), false);
assert.ok((await html("/property/109-rai-eec-rayong")).includes("Sold out"));
assert.ok((await html("/property/37-rai-eec-rayong")).includes("36.91825"));
assert.ok((await html("/property/101-rai-kabin-buri")).includes("ข้อมูลประกอบการพิจารณาที่ดิน"));
assert.ok((await html("/land-insights")).includes("ไม่ใช่ราคาซื้อขายจริง"));
const home = await html("/");
assert.equal((home.match(/ค้นหาทรัพย์บนแผนที่/g) ?? []).length >= 1, true);
assert.ok(home.includes("ค้นหาที่ดิน โรงงาน และโกดัง"));
assert.ok(home.includes('href="/buy-request"'));
assert.ok((await html("/land/rayong")).includes(rayong));
assert.ok((await html("/land/rayong/industrial")).includes(rayong));
// Without a configured demand database, sitemap must fail instead of claiming a complete empty result.
assert.equal((await fetch(`${base}/sitemap.xml`)).status, 500);
checks++;
const admin = await fetch(`${base}/admin/agents`, { redirect: "manual" });
assert.ok([302, 303, 307, 308].includes(admin.status), "/admin/agents redirects to login");
assert.equal(new URL(admin.headers.get("location"), base).pathname, "/login");
checks++;
for (const path of ["/api/saved-searches"]) {
  assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  checks++;
}
console.log(`Marketplace local/no-database smoke: ${checks} route checks passed; production publication not verified.`);
