import { getPublicInventory } from "@/lib/public-inventory";
import type { Land } from "@/lib/types/database";

export interface IntelligenceInventory {
  lands: Land[];
  source: "database" | "repository";
}

/** DB errors propagate: a failed live load must not become an apparently current seed report. */
export async function loadIntelligenceInventory(readListings = getPublicInventory): Promise<IntelligenceInventory> {
  const lands = (await readListings()).filter((land) => land.status === "active" && !land.deleted_at);
  // No seed merge: a configured database owns active/reserved/sold status.
  return { lands, source: process.env.DATABASE_URL?.trim() ? "database" : "repository" };
}
