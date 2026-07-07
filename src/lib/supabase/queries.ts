import { supabase } from "./client";
import type { Land, Province, BuyerDemand, BlogPost, SiteStats } from "@/lib/types/database";

function getClient() {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

// ─── Listings ────────────────────────────────────────────────────────────────

export async function getActiveListings(opts?: {
  province_slug?: string;
  land_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Land[]> {
  const db = getClient();
  let query = db
    .from("lands")
    .select(
      opts?.province_slug
        ? "*, province:provinces!inner(*), images:land_images(*)"
        : "*, province:provinces(*), images:land_images(*)"
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.province_slug) {
    query = query.eq("province.slug", opts.province_slug);
  }
  if (opts?.land_type) {
    query = query.eq("land_type", opts.land_type);
  }
  if (opts?.limit) query = query.limit(opts.limit);
  if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 12) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data as Land[]) ?? [];
}

export async function getFeaturedListings(limit = 6): Promise<Land[]> {
  const db = getClient();
  const { data, error } = await db
    .from("lands")
    .select("*, province:provinces(*), images:land_images(*)")
    .eq("status", "active")
    .eq("is_featured", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as Land[]) ?? [];
}

export async function getListingByRef(publicRef: number): Promise<Land | null> {
  const db = getClient();
  const { data, error } = await db
    .from("lands")
    .select("*, province:provinces(*), images:land_images(*)")
    .eq("public_ref", publicRef)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as Land) ?? null;
}

export async function getRelatedListings(land: Land, limit = 4): Promise<Land[]> {
  const db = getClient();
  const { data, error } = await db
    .from("lands")
    .select("*, province:provinces(*), images:land_images(*)")
    .eq("status", "active")
    .eq("province_id", land.province_id)
    .eq("land_type", land.land_type)
    .neq("id", land.id)
    .is("deleted_at", null)
    .limit(limit);

  if (error) throw error;
  return (data as Land[]) ?? [];
}

// ─── Provinces ───────────────────────────────────────────────────────────────

export async function getAllProvinces(): Promise<Province[]> {
  const db = getClient();
  const { data, error } = await db
    .from("provinces")
    .select("*")
    .order("name_th");
  if (error) throw error;
  return data ?? [];
}

export async function getProvinceBySlug(slug: string): Promise<Province | null> {
  const db = getClient();
  const { data, error } = await db
    .from("provinces")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

// ─── Buyer Demand ─────────────────────────────────────────────────────────────

export async function getActiveDemands(limit = 20): Promise<BuyerDemand[]> {
  const db = getClient();
  const { data, error } = await db
    .from("buyer_demand")
    .select("*, province:provinces(*)")
    .eq("status", "active")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as BuyerDemand[]) ?? [];
}

export async function getDemandBySlug(slug: string): Promise<BuyerDemand | null> {
  const db = getClient();
  const { data, error } = await db
    .from("buyer_demand")
    .select("*, province:provinces(*)")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as BuyerDemand) ?? null;
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export async function getPublishedPosts(opts?: {
  category_slug?: string;
  limit?: number;
  offset?: number;
}): Promise<BlogPost[]> {
  const db = getClient();
  let query = db
    .from("blog_posts")
    .select(
      opts?.category_slug
        ? "*, category:categories!inner(*)"
        : "*, category:categories(*)"
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (opts?.category_slug) {
    query = query.eq("category.slug", opts.category_slug);
  }
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data as BlogPost[]) ?? [];
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = getClient();
  const { data, error } = await db
    .from("blog_posts")
    .select("*, category:categories(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as BlogPost) ?? null;
}

// ─── Site Stats ───────────────────────────────────────────────────────────────

export async function getSiteStats(): Promise<SiteStats> {
  try {
    const db = getClient();
    const { data } = await db.from("site_stats").select("*").single();
    return (
      data ?? { total_partners: 0, total_listings: 0, total_deals: 0, total_payout_mb: 0 }
    );
  } catch {
    return { total_partners: 0, total_listings: 0, total_deals: 0, total_payout_mb: 0 };
  }
}
