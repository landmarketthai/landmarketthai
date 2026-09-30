import { getSupabasePublicConfig } from "@/lib/supabase/env";
import { getActiveListings } from "@/lib/supabase/queries";
import { SEED_ACTIVE_LISTINGS } from "@/lib/seed-listings";
import type { Land } from "@/lib/types/database";

export interface IntelligenceInventory {
  lands: Land[];
  source: "database" | "repository";
}

/** DB errors propagate: a failed live load must not become an apparently current seed report. */
export async function loadIntelligenceInventory(readListings = getActiveListings): Promise<IntelligenceInventory> {
  if (!getSupabasePublicConfig()) return { lands: [...SEED_ACTIVE_LISTINGS], source: "repository" };
  const lands: Land[] = [];
  // Supabase returns bounded pages. Fetch the full inventory before reporting aggregates.
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await readListings({ limit: pageSize, offset });
    lands.push(...page);
    if (page.length < pageSize) break;
  }
  // No seed merge: a configured database owns active/reserved/sold status.
  return { lands, source: "database" };
}
