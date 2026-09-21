export type LandType =
  | "industrial"
  | "eec"
  | "factory"
  | "warehouse"
  | "logistics"
  | "data_center"
  | "investment";

export type ZoningColor =
  | "purple"
  | "purple_light"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "other";

export type LocationPrecision = "exact" | "approx";

export type ListingStatus = "draft" | "active" | "reserved" | "sold" | "archived";

export type LeadType = "buyer" | "partner" | "owner";

export type LeadStatus = "new" | "contacting" | "qualified" | "won" | "lost";

export type DocType = "title_deed" | "map" | "brochure" | "other";

export type DemandStatus = "active" | "matched" | "closed";

export type DealStatus = "in_progress" | "closed" | "cancelled";
export type DealStage = "qualified" | "property_sent" | "site_visit" | "negotiation" | "offer" | "deposit" | "won" | "lost";
export type CommissionStatus = "estimated" | "approved" | "payable" | "paid" | "cancelled";

export type PartnerStatus = "pending" | "active" | "inactive";

export type PostStatus = "draft" | "published";

export type EntityType = "buyer" | "owner";

export interface Province {
  id: string;
  name_th: string;
  name_en: string;
  slug: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Land {
  id: string;
  public_ref: number;
  title_th: string;
  slug: string;
  province_id: string;
  district: string | null;
  land_type: LandType;
  size_rai: number;
  zoning: ZoningColor | null;
  frontage_m: number | null;
  price_per_rai: number;
  total_price: number | null;
  referral_reward_max: number | null;
  is_eec: boolean;
  nearby_landmarks: string[] | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  location_precision: LocationPrecision;
  status: ListingStatus;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_lead_id?: string | null;
  // joined
  province?: Province;
  images?: LandImage[];
}

export interface LandImage {
  id: string;
  land_id: string;
  storage_key: string;
  url_or_cdn_path: string;
  width: number | null;
  height: number | null;
  alt_th: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

export interface LandDocument {
  id: string;
  land_id: string | null;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  doc_type: DocType;
  is_sensitive: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  lead_type: LeadType;
  name: string;
  phone: string;
  line_id: string | null;
  source: string | null;
  referral_code: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  next_action_at: string | null;
  last_reminded_at: string | null;
  details: Record<string, unknown>;
  consent_pdpa: boolean;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: "note" | "call" | "line" | "site_visit" | "other";
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface LeadAttachment {
  id: string;
  lead_id: string;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  doc_type: DocType;
  is_sensitive: boolean;
  created_at: string;
}

export interface Partner {
  id: string;
  lead_id: string | null;
  name: string;
  phone: string;
  line_id: string | null;
  referral_code: string;
  working_area: string | null;
  experience: string | null;
  network_size: string | null;
  status: PartnerStatus;
  total_paid: number;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  land_id: string | null;
  listing_ref: string | null;
  listing_title: string | null;
  buyer_lead_id: string | null;
  partner_id: string | null;
  referral_code: string | null;
  deal_value: number | null;
  commission_paid: number | null;
  expected_commission: number | null;
  status: DealStatus;
  stage: DealStage;
  assigned_to: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  deal_id: string;
  source_lead_id: string | null;
  source_type: "buyer" | "owner";
  partner_id: string | null;
  referral_code: string | null;
  amount_estimated: number | null;
  amount_approved: number | null;
  amount_paid: number;
  status: CommissionStatus;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralAttribution {
  id: string;
  referral_code: string;
  lead_id: string;
  partner_id: string | null;
  entity_type: EntityType;
  first_touch_at: string;
  converted: boolean;
  deal_id: string | null;
}

export interface BuyerDemand {
  id: string;
  slug: string;
  province_id: string | null;
  land_type: LandType | null;
  size_min_rai: number | null;
  size_max_rai: number | null;
  intended_use: string | null;
  budget_note: string | null;
  status: DemandStatus;
  is_public: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  // joined
  province?: Province;
}

export interface Category {
  id: string;
  name_th: string;
  slug: string;
  type: "blog" | "land";
  parent_id: string | null;
}

export interface BlogPost {
  id: string;
  title_th: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  cover_image_key: string | null;
  category_id: string | null;
  status: PostStatus;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
}

export interface Tag {
  id: string;
  name_th: string;
  slug: string;
}

export interface SiteStats {
  total_partners: number;
  total_listings: number;
  total_deals: number;
  total_payout_mb: number;
}
