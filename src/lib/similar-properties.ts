import type { Land } from "@/lib/types/database";

function proximity(a: number, b: number): number {
  return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0
    ? Math.min(a, b) / Math.max(a, b)
    : 0;
}

/** Compare known attributes; missing zoning and non-EEC status are not matches. */
export function rankSimilarProperties(source: Land, candidates: Land[], limit = 4): Land[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const seen = new Set<string>();
  return candidates
    .filter((land) => land.status === "active" && !land.deleted_at && land.id !== source.id && land.slug !== source.slug)
    .map((land) => {
      const sameProvince = land.province_id === source.province_id ||
        Boolean(source.province?.slug && land.province?.slug === source.province.slug);
      const attributes = (sameProvince ? 35 : 0) +
        (land.land_type === source.land_type ? 25 : 0) +
        (source.zoning && source.zoning !== "other" && land.zoning === source.zoning ? 15 : 0) +
        (source.is_eec && land.is_eec ? 10 : 0);
      return {
        land,
        attributes,
        score: attributes + 10 * proximity(source.size_rai, land.size_rai) +
          10 * proximity(source.price_per_rai, land.price_per_rai),
      };
    })
    .filter((match) => match.attributes > 0)
    .sort((a, b) => b.score - a.score ||
      (a.land.slug < b.land.slug ? -1 : a.land.slug > b.land.slug ? 1 : 0) ||
      (a.land.id < b.land.id ? -1 : a.land.id > b.land.id ? 1 : 0))
    .filter(({ land }) => {
      if (seen.has(land.slug)) return false;
      seen.add(land.slug);
      return true;
    })
    .slice(0, Math.floor(limit))
    .map(({ land }) => land);
}
