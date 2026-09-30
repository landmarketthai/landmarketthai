import type { Land } from "@/lib/types/database";

export type PropertySort = "newest" | "price_asc" | "price_desc" | "price_per_rai_asc" | "size_desc";

function propertyPrice(property: Land): number | null {
  return property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
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
    if (sort === "size_desc") difference = compareNullable(a.size_rai, b.size_rai, "desc");
    if (difference !== 0) return difference;

    const aDate = Date.parse(a.updated_at || a.published_at || a.created_at);
    const bDate = Date.parse(b.updated_at || b.published_at || b.created_at);
    const dateDifference = (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
    if (dateDifference !== 0) return dateDifference;
    return a.public_ref - b.public_ref;
  });
}

export function propertySqlOrder(sort: PropertySort = "newest"): string {
  const activeFirst = "case when l.status = 'active' then 0 else 1 end";
  if (sort === "price_asc") {
    return `${activeFirst}, (case when l.transaction_type = 'rent' then l.rent_price_monthly else l.total_price end) asc nulls last, l.created_at desc`;
  }
  if (sort === "price_desc") {
    return `${activeFirst}, (case when l.transaction_type = 'rent' then l.rent_price_monthly else l.total_price end) desc nulls last, l.created_at desc`;
  }
  if (sort === "price_per_rai_asc") return `${activeFirst}, l.price_per_rai asc nulls last, l.created_at desc`;
  if (sort === "size_desc") return `${activeFirst}, l.size_rai desc nulls last, l.created_at desc`;
  return `${activeFirst}, l.is_featured desc, coalesce(l.published_at, l.created_at) desc`;
}
