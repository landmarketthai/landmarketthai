import { SEED_PUBLIC_LISTINGS } from "@/lib/seed-listings";
import type { Land } from "@/lib/types/database";

export async function getPublicInventory(
  readListings = async (opts: { limit: number; offset: number }) =>
    (await import("@/lib/neon/queries")).getPublicListings(opts),
  configured = Boolean(process.env.DATABASE_URL?.trim()),
): Promise<Land[]> {
  if (!configured) return [...SEED_PUBLIC_LISTINGS];
  const inventory: Land[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await readListings({ limit: 100, offset });
    inventory.push(...page);
    if (page.length < 100) return inventory;
  }
}
