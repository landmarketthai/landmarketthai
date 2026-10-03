import type { MetadataRoute } from "next";
import { getActiveDemands, getPublishedPosts } from "@/lib/neon/queries";
import { getPublicInventory } from "@/lib/public-inventory";
import { populatedArchivePaths } from "@/lib/public-seo";
import { SITE_URL } from "@/lib/constants/site";
import { isPublishedDemand } from "@/components/demand/BuyerDemandList";

export const revalidate = 300;
// ponytail: single sitemap capped at 50k URLs; shard when inventory approaches the limit.

async function getSitemapDemands(capacity: number) {
  if (!process.env.DATABASE_URL?.trim()) return [];
  const demands: Awaited<ReturnType<typeof getActiveDemands>> = [];
  for (let offset = 0; offset < capacity; offset += 200) {
    const limit = Math.min(200, capacity - offset);
    const page = await getActiveDemands(limit, offset);
    demands.push(...page.filter(isPublishedDemand));
    if (page.length < limit) break;
  }
  return demands.slice(0, capacity);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, posts] = await Promise.all([
    getPublicInventory().catch(() => []),
    getPublishedPosts({ limit: 100 }).catch(() => []),
  ]);
  const paths = ["", "/land", "/search", "/sell", "/buy-request", "/become-partner",
    "/how-it-works", "/about", "/contact", "/privacy", "/terms",
    ...populatedArchivePaths(listings), ...(posts.length ? ["/blog"] : [])];
  const basePages: MetadataRoute.Sitemap = [
    ...paths.map(path => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority: path ? 0.7 : 1 })),
    ...listings.map(land => ({ url: `${SITE_URL}/property/${land.slug}`, lastModified: new Date(land.updated_at), changeFrequency: "weekly" as const, priority: 0.85 })),
    ...posts.map(post => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: new Date(post.updated_at), changeFrequency: "monthly" as const, priority: 0.7 })),
  ].slice(0, 50_000);
  // Reserve one URL for the demand archive, and cap sitemap at the protocol limit.
  const demands = await getSitemapDemands(Math.max(0, 49_999 - basePages.length));
  return [...basePages,
    ...(demands.length ? [{ url: `${SITE_URL}/buyer-demand`, changeFrequency: "daily" as const, priority: 0.8 }] : []),
    ...demands.map(d => ({ url: `${SITE_URL}/buyer-demand/${d.slug}`, lastModified: new Date(d.published_at), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
