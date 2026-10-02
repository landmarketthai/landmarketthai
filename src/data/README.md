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
