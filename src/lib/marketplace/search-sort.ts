import type { Land } from "@/lib/types/database";

export type PropertySort = "newest" | "price_asc" | "price_desc" | "price_per_rai_asc" | "size_desc";

function propertyPrice(property: Land): number | null {
  return property.total_price;
}

function positive(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

function compareNullable(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function sortPropertyResults(properties: Land[], sort: PropertySort = "newest"): Land[] {
  return [...properties].sort((a, b) => {
    const statusRank = (property: Land) => property.status === "active" ? 0 : 1;
    const statusDifference = statusRank(a) - statusRank(b);
    if (statusDifference !== 0) return statusDifference;

    let difference = 0;
    if (sort === "price_asc") difference = compareNullable(propertyPrice(a), propertyPrice(b), "asc");
    if (sort === "price_desc") difference = compareNullable(propertyPrice(a), propertyPrice(b), "desc");
    if (sort === "price_per_rai_asc") difference = compareNullable(a.price_per_rai, b.price_per_rai, "asc");
    // Land area (rai) first, then usable area (sq.m.); units are never converted, so building-only
    // assets rank after land-area assets, by their own usable area.
    if (sort === "size_desc") difference = compareNullable(positive(a.size_rai), positive(b.size_rai), "desc")
      || compareNullable(positive(a.usable_area_sqm), positive(b.usable_area_sqm), "desc");
    if (difference !== 0) return difference;

    const aDate = Date.parse(a.updated_at || a.published_at || a.created_at);
    const bDate = Date.parse(b.updated_at || b.published_at || b.created_at);
    const dateDifference = (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
    if (dateDifference !== 0) return dateDifference;
    return a.public_ref - b.public_ref;
  });
}

/** SQL mirror of sortPropertyResults, so paging DB candidates in this order never skips a true match. */
export function propertySqlOrder(sort: PropertySort = "newest"): string {
  const activeFirst = "case when l.status = 'active' then 0 else 1 end";
  // Same fallback chain and millisecond precision as the Date.parse comparison above.
  const updated = "date_trunc('milliseconds', coalesce(l.updated_at, (to_jsonb(l) ->> 'published_at')::timestamptz, l.created_at)) desc nulls last";
  const key: Partial<Record<PropertySort, string>> = {
    price_asc: "l.total_price asc nulls last",
    price_desc: "l.total_price desc nulls last",
    price_per_rai_asc: "l.price_per_rai asc nulls last",
    size_desc: "case when l.size_rai > 0 then l.size_rai end desc nulls last, "
      + "case when (to_jsonb(l) ->> 'usable_area_sqm')::numeric > 0 then (to_jsonb(l) ->> 'usable_area_sqm')::numeric end desc nulls last",
  };
  return [activeFirst, key[sort], updated, "l.public_ref asc", "l.id asc"].filter(Boolean).join(", ");
}
