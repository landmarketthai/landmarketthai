// Run against `npm run start -- --port 3101` built without database credentials.
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
assert.ok(buyer.includes('name="phone"') && buyer.includes('name="size_min_rai"'));
const sell = await fetch(`${base}/sell`, { redirect: "manual" });
assert.ok([307, 308].includes(sell.status));
assert.equal(sell.headers.get("location"), "/submit-land");
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
assert.ok((await html("/")).includes("ค้นหาและเลือกแปลงบนแผนที่"));
assert.ok((await html("/land/rayong")).includes(rayong));
assert.ok((await html("/land/rayong/industrial")).includes(rayong));
const sitemap = await html("/sitemap.xml");
assert.ok(sitemap.includes("/land-insights") && sitemap.includes("/property/109-rai-eec-rayong"));
for (const path of ["/admin/agents", "/api/saved-searches"]) {
  assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  checks++;
}
console.log(`Marketplace production smoke: ${checks} route checks passed.`);
