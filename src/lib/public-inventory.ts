import { SEED_ACTIVE_LISTINGS } from "@/lib/seed-listings";
import { getSupabasePublicConfig } from "@/lib/supabase/env";
import { getPublicListings } from "@/lib/supabase/queries";

export async function getPublicInventory() {
  if (!getSupabasePublicConfig()) return SEED_ACTIVE_LISTINGS;
  return getPublicListings();
}
