# landmarketthai

P2 intelligence integration:

- Pure helpers and types: `@/lib/land-intelligence` (overlays, anchors, distances, analytics, forward/reverse matching, validated buyer requirements).
- Read-only components: `@/components/intelligence` (`InventoryAnalytics`, `PropertyIntelligence`, `PropertyBuyerRecommendations`). Render buyer recommendations only behind `requireAdmin`; never pass leads to public pages.
- Public route: `/land-insights`, active asking-inventory statistics by province, type and reported zoning. No navigation changes. Reverse recommendations are integrated into `/admin/properties/[id]`; existing buyer recommendations remain in `/admin/leads/[id]`.
- Buyer JSON API and server action accept `zoning`, `is_eec`, `frontage_min_m`, and paired `anchor_id` / `distance_max_km`, alongside the existing province/type/size/budget requirements. Use registered anchor IDs. Matching is deterministic, advisory, and requires human approval; it sends no messages and creates no deals automatically.

Data limitations:

- Only repo-known zoning labels, listing fields, province reference coordinates (`supabase/schema.sql`) and existing marketing map pins (`property-detail-data.ts`) are used. No polygons, parcel boundaries, new facility coordinates or legal land-use determinations are supplied. EEC province context does not establish parcel eligibility or incentives.
- Logistics landmarks without coordinates stay unknown. Distances are spherical straight-line km, never travel times or driving distances. Seed parcel coordinates stay null; marketing pins and province points are separate anchors, not replacements for parcel locations.
- Analytics describe **LandmarketThai active inventory only**, in THB, from listing asking prices. They are not sold prices, market-wide statistics or valuations. Invalid/missing prices are excluded from each price metric's count; active listing count is reported separately. Comparables require the same known province and land type, exclude the subject, and prefer reported zoning, size and proximity.
- When Supabase is configured, all active inventory pages are loaded without adding seeds; database errors propagate. Without Supabase, the route explicitly labels its two canonical repository listings as offline data. Pagination is a current read, not a transactionally frozen snapshot. Reverse admin matching considers the latest 1,000 open buyer leads; the pure ranking function accepts any supplied candidate set.

Verification: `npm test`, `npm run lint`, `npm run build` (use `npm.cmd` in Windows PowerShell when script execution is restricted).
