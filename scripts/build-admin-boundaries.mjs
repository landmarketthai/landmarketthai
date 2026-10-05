// Builds public/geo/th/<provinceCode>.json: province outline + every district outline, keyed by Thai name.
//
// Source polygons: geoBoundaries THA ADM2 (Royal Thai Survey Department / OCHA ROAP, CC BY 3.0 IGO)
//   https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/THA/ADM2/geoBoundaries-THA-ADM2.geojson  (full resolution, ~266MB)
// Thai names and province codes: src/data/thailand-flat.json (Open Admin Data, CC-BY-4.0).
// Province outlines are dissolved from their districts, so both levels share the same edges.
//
// Usage: node scripts/build-admin-boundaries.mjs <path-to-ADM2.geojson>   (needs network once for npx mapshaper)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [adm2Path] = process.argv.slice(2);
if (!adm2Path) throw new Error("usage: node scripts/build-admin-boundaries.mjs <ADM2.geojson>");

const work = mkdtempSync(join(tmpdir(), "admin-boundaries-"));
const mapshaper = (...args) => execFileSync("npx", ["-y", "mapshaper@0.6", ...args], { stdio: "inherit", shell: process.platform === "win32" });
// Simplify by distance, not percentage, so small Bangkok districts keep their real shape.
mapshaper(adm2Path, "-simplify", "interval=120", "keep-shapes", "-o", "precision=0.0001", join(work, "simplified.geojson"));
const adm2 = JSON.parse(readFileSync(join(work, "simplified.geojson"), "utf8"));
const districts = JSON.parse(readFileSync("src/data/thailand-flat.json", "utf8")).data.filter((entry) => entry.level === 2);

const norm = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const polygons = (geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const contains = (point, geometry) => polygons(geometry).some(([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole)));
const center = (district) => district.geo?.lat ? [Number(district.geo.lon), Number(district.geo.lat)] : null;

// Match strictest first so a loose match never steals a polygon a strict one needs.
const passes = [
  (d, free) => free.find((f) => norm(f.properties.shapeName) === norm(d.name.en) && center(d) && contains(center(d), f.geometry)),
  (d, free) => { const hits = free.filter((f) => norm(f.properties.shapeName) === norm(d.name.en)); return hits.length === 1 ? hits[0] : null; },
  (d, free) => center(d) && free.find((f) => contains(center(d), f.geometry)),
];
const matched = new Map();
const used = new Set();
for (const pass of passes) {
  for (const district of districts) {
    if (matched.has(district)) continue;
    const feature = pass(district, adm2.features.filter((f) => !used.has(f)));
    if (feature) { matched.set(district, feature); used.add(feature); }
  }
}
const missing = districts.filter((district) => !matched.has(district));
if (missing.length) throw new Error(`unmatched districts: ${missing.map((d) => d.name.local).join(", ")}`);
for (const [district, feature] of matched) {
  feature.properties = { prov: district.parent.id, name_th: district.name.local.replace(/^(อำเภอ|เขต)\s*/, "") };
}
adm2.features = [...used];

writeFileSync(join(work, "districts.geojson"), JSON.stringify(adm2));
mapshaper(join(work, "districts.geojson"), "-dissolve", "prov", "-o", "precision=0.0001", join(work, "provinces.geojson"));

const districtOut = JSON.parse(readFileSync(join(work, "districts.geojson"), "utf8")).features;
const provinceOut = JSON.parse(readFileSync(join(work, "provinces.geojson"), "utf8")).features;
mkdirSync("public/geo/th", { recursive: true });
for (const province of provinceOut) {
  const code = province.properties.prov;
  const file = {
    p: province.geometry,
    d: Object.fromEntries(districtOut.filter((f) => f.properties.prov === code).map((f) => [f.properties.name_th, f.geometry])),
  };
  writeFileSync(`public/geo/th/${code}.json`, JSON.stringify(file));
}
console.log(`wrote ${provinceOut.length} provinces, ${districtOut.length} districts to public/geo/th`);
