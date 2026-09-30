import { getSupabasePublicConfig } from "@/lib/supabase/env";
import { getPublicListings } from "@/lib/supabase/queries";
import { SEED_ACTIVE_LISTINGS } from "@/lib/seed-listings";
import type { Land } from "@/lib/types/database";

export interface IntelligenceInventory {
  lands: Land[];
  source: "database" | "repository";
}

/** DB errors propagate: a failed live load must not become an apparently current seed report. */
export async function loadIntelligenceInventory(readListings = getPublicListings): Promise<IntelligenceInventory> {
  if (!getSupabasePublicConfig()) return { lands: [...SEED_ACTIVE_LISTINGS], source: "repository" };
  const lands = (await readListings()).filter((land) => land.status === "active" && !land.deleted_at);
  // No seed merge: a configured database owns active/reserved/sold status.
  return { lands, source: "database" };
}
