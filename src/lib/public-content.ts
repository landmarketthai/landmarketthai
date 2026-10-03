import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getActiveDemands, getPublishedPosts } from "@/lib/neon/queries";
import { isPublishedDemand } from "@/components/demand/BuyerDemandList";

/** null means unavailable, not known-empty; preserve visibility during outages. */
export const getPublicContentAvailability = cache(unstable_cache(async () => {
  if (!process.env.DATABASE_URL?.trim()) return { blog: null, buyerDemand: null };
  const [posts, demands] = await Promise.allSettled([
    getPublishedPosts({ limit: 1 }), getActiveDemands(1),
  ]);
  return {
    blog: posts.status === "fulfilled" ? posts.value.length > 0 : null,
    buyerDemand: demands.status === "fulfilled" ? demands.value.some(isPublishedDemand) : null,
  };
}, ["public-content-availability"], { revalidate: 300 }));
