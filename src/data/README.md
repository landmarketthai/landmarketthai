# Thailand administrative divisions

Source: [Open Admin Data](https://openadmindata.org/th/) —
[open-admin-data/thailand-administrative-divisions](https://github.com/open-admin-data/thailand-administrative-divisions),
release 2026.06, licensed [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

- `thailand-flat.json` — 77 provinces + 928 districts with approximate `geo.lat` / `geo.lon` centers.
- `thailand-admin.json` — province → district → subdistrict hierarchy (7,364 subdistricts, names only, no geo).

Used server-side only by `src/lib/thai-admin.ts` (served via `GET /api/thai-admin`) for the `/sell`
dependent location dropdowns, and by `db/migrations/20261002_thai_provinces_seed.sql`.
Centers are approximate and only move the map; they are never stored as a property's coordinates.
Subdistricts have no geo in this release, so they reuse their district center.

## Map boundaries (`public/geo/th/<provinceCode>.json`)

Province and district outlines for the `/search` map, one file per province:
`{ p: <province geometry>, d: { <district name_th>: <geometry> } }`, loaded only for the selected province.

- Polygons: [geoBoundaries](https://www.geoboundaries.org) THA ADM2 (Royal Thai Survey Department / OCHA ROAP),
  licensed CC BY 3.0 IGO. Province outlines are dissolved from their districts.
- Thai names and codes come from `thailand-flat.json` above (928/928 districts matched).
- Rebuild: `node scripts/build-admin-boundaries.mjs <geoBoundaries-THA-ADM2.geojson>` (runs `npx mapshaper`).
