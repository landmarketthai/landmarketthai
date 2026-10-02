import type { MetadataRoute } from "next";
import { getAllProvinces, getActiveDemands, getPublishedPosts } from "@/lib/neon/queries";
import { LAND_TYPE_LABELS, landTypeSlug } from "@/lib/utils";
import { getPublicInventory } from "@/lib/public-inventory";
import type { LandType } from "@/lib/types/database";
import { isPublishedDemand } from "@/components/demand/BuyerDemandList";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landmarketthai.com";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getSitemapDemands(capacity: number) {
  const demands: Awaited<ReturnType<typeof getActiveDemands>> = [];
  for (let offset = 0; offset < Math.max(capacity, 1); offset += 200) {
    const limit = Math.min(200, Math.max(capacity - offset, 1));
    const page = await getActiveDemands(limit, offset);
    demands.push(...page);
    if (page.length < limit) return demands.slice(0, capacity);
  }
  return demands.slice(0, capacity);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, provinces, posts] = await Promise.all([
    getPublicInventory().catch(() => []),
    getAllProvinces().catch(() => []),
    getPublishedPosts({ limit: 200 }).catch(() => []),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/land`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/search`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/land-insights`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/property/37-rai-eec-rayong`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE}/property/101-rai-kabin-buri`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE}/property/109-rai-eec-rayong`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/sell`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/buy-request`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/become-partner`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/buyer-demand`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/blog`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "monthly", priority: 0.3 },
  ];

  // Province hub pages
  const provincePages: MetadataRoute.Sitemap = provinces.flatMap((p) => {
    const hubUrl = `${SITE}/land/${p.slug}`;
    const hub: MetadataRoute.Sitemap[0] = {
      url: hubUrl,
      changeFrequency: "weekly",
      priority: 0.8,
    };
    const typePages: MetadataRoute.Sitemap = (Object.keys(LAND_TYPE_LABELS) as LandType[]).map((type) => ({
      url: `${SITE}/land/${p.slug}/${landTypeSlug(type)}`,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));
    return [hub, ...typePages];
  });

  // Listing detail pages
  const listingPages: MetadataRoute.Sitemap = listings.map((land) => ({
    url: `${SITE}/properties/${land.slug}`,
    lastModified: new Date(land.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  // Blog posts
  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // ponytail: cap at 50,000 URLs, use generateSitemaps if inventory grows beyond it.
  const basePages = [...staticPages, ...provincePages, ...listingPages, ...blogPages].slice(0, 50_000);
  const demands = await getSitemapDemands(50_000 - basePages.length);
  // Buyer demand pages
  const demandPages: MetadataRoute.Sitemap = demands.filter(isPublishedDemand).map((d) => ({
    url: `${SITE}/buyer-demand/${d.slug}`,
    lastModified: new Date(d.published_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...basePages, ...demandPages];
}
