import type { MetadataRoute } from "next";
import { getPublicListings, getAllProvinces, getActiveDemands, getPublishedPosts } from "@/lib/neon/queries";
import { LAND_TYPE_LABELS, listingHref, landTypeSlug } from "@/lib/utils";
import type { LandType } from "@/lib/types/database";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landmarketthai.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, provinces, demands, posts] = await Promise.all([
    getPublicListings({ limit: 500 }).catch(() => []),
    getAllProvinces().catch(() => []),
    getActiveDemands(200).catch(() => []),
    getPublishedPosts({ limit: 200 }).catch(() => []),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/land`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/search`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/property/37-rai-eec-rayong`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE}/property/101-rai-kabin-buri`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE}/become-partner`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/submit-land`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/buy-request`, changeFrequency: "monthly", priority: 0.8 },
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
    url: `${SITE}${listingHref(land.public_ref, land.slug)}`,
    lastModified: new Date(land.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }));

  // Buyer demand pages
  const demandPages: MetadataRoute.Sitemap = demands.map((d) => ({
    url: `${SITE}/buyer-demand/${d.slug}`,
    lastModified: new Date(d.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Blog posts
  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...provincePages,
    ...listingPages,
    ...demandPages,
    ...blogPages,
  ];
}
