/** Canonical seller/buyer property categories (labels: PROPERTY_TYPE_LABELS). */
export type PropertyType =
  | "land"
  | "house"
  | "house_with_land"
  | "townhouse"
  | "condo"
  | "housing_project"
  | "commercial_building"
  | "office"
  | "factory"
  | "warehouse"
  | "apartment"
  | "hotel_resort"
  | "retail"
  | "business_property"
  | "other";

/** Legacy public land categories kept for existing lands rows and /land/[province]/[type] SEO pages. */
export type LegacyLandType = "industrial" | "eec" | "logistics" | "data_center" | "investment";
/** Published submissions store land_type = property_type, so land_type accepts both sets. */
export type LandType = PropertyType | LegacyLandType;

export type ZoningColor =
  | "purple"
  | "purple_light"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "other";

export type LocationPrecision = "exact" | "approx";
export type TransactionType = "sale";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type ListingStatus = "draft" | "active" | "reserved" | "sold" | "expired" | "archived";
export type SubmissionStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "rejected"
  | "sold"
  | "expired";
export type LeadType = "buyer" | "partner" | "owner";
export type LeadStatus = "new" | "contacting" | "qualified" | "won" | "lost";
export type DocType = "title_deed" | "map" | "brochure" | "other";
export type DemandStatus = "published" | "unpublished" | "matched" | "closed" | "expired";
export type BuyerRequirementStatus = "pending_review" | "approved" | "published" | "rejected" | "matched" | "closed" | "expired";
export type DealStatus = "in_progress" | "closed" | "cancelled";
export type DealStage = "qualified" | "property_sent" | "site_visit" | "negotiation" | "offer" | "deposit" | "won" | "lost";
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

export interface Agent {
  id: string;
  display_name: string;
  verified_at?: string | null;
  verified_by?: string | null;
}

export interface Land {
  id: string;
  public_ref: number;
  title_th: string;
  slug: string;
  province_id: string;
  district: string | null;
  subdistrict: string | null;
  address: string | null;
  land_type: LandType;
  property_type: PropertyType;
  transaction_type: TransactionType;
  size_rai: number | null;
  area_rai: number | null;
  area_ngan: number | null;
  area_sqwa: number | null;
  /** Building / unit usable area for non-land assets; optional because older schemas lack the column. */
  usable_area_sqm?: number | null;
  zoning: ZoningColor | null;
  frontage_m: number | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  road_name: string | null;
  road_width_m: number | null;
  price_per_rai: number | null;
  total_price: number | null;
  referral_reward_max: number | null;
  is_eec: boolean;
  nearby_landmarks: string[] | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  location_precision: LocationPrecision;
  status: ListingStatus;
  verification_status: VerificationStatus;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Derived: a title-deed document exists in land_documents (file itself stays private). */
  title_deed_on_file?: boolean;
  province?: Province;
  images?: LandImage[];
  verified_at?: string | null;
  verified_by?: string | null;
  agent?: Agent | null;
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

export interface PropertySubmission {
  id: string;
  draft_token: string;
  user_id: string | null;
  owner_lead_id: string | null;
  linked_land_id: string | null;
  property_type: PropertyType | null;
  transaction_type: TransactionType | null;
  title: string | null;
  province_id: string | null;
  district: string | null;
  subdistrict: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  location_precision: LocationPrecision;
  area_rai: number | null;
  area_ngan: number | null;
  area_sqwa: number | null;
  total_rai: number | null;
  usable_area_sqm: number | null;
  frontage_m: number | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  road_name: string | null;
  road_width_m: number | null;
  zoning: ZoningColor | null;
  sale_price: number | null;
  price_per_rai: number | null;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  status: SubmissionStatus;
  verification_status: VerificationStatus;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  province?: Province;
  media?: PropertySubmissionMedia[];
}

export interface PropertySubmissionMedia {
  id: string;
  submission_id: string;
  media_kind: "image" | "document";
  file_name: string;
  storage_key: string;
  public_url: string | null;
  mime_type: string;
  size_bytes: number;
  doc_type: DocType | null;
  sort_order: number;
  is_cover: boolean;
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
  details: Record<string, unknown>;
  consent_pdpa: boolean;
  consent_at: string | null;
  created_at: string;
  updated_at: string;
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
  min_usable_area_sqm?: number | null;
  max_usable_area_sqm?: number | null;
  intended_use: string | null;
  budget_note: string | null;
  status: DemandStatus;
  max_price: number | null;
  max_price_per_rai: number | null;
  zoning: ZoningColor | null;
  container_access: boolean | null;
  high_voltage: boolean | null;
  province_names: string[];
  published_at: string;
  is_public: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  province?: Province;
}

/** Public rendering contract excludes contacts, source IDs, SEO overrides and free text. */
export type PublicBuyerDemand = Pick<BuyerDemand,
  | "slug" | "land_type" | "size_min_rai" | "size_max_rai" | "min_usable_area_sqm" | "max_usable_area_sqm"
  | "max_price" | "max_price_per_rai" | "zoning" | "container_access" | "high_voltage"
  | "province_names" | "published_at" | "status" | "is_public"
> & { province?: Pick<Province, "name_th"> };

export interface BuyerRequirement {
  public_slug?: string | null;
  id: string;
  lead_id: string | null;
  property_type: PropertyType | null;
  transaction_type: TransactionType;
  preferred_locations: string[];
  province_ids: string[];
  min_size_rai: number | null;
  max_size_rai: number | null;
  min_usable_area_sqm?: number | null;
  max_usable_area_sqm?: number | null;
  max_price: number | null;
  max_price_per_rai: number | null;
  zoning: ZoningColor | null;
  purpose: string | null;
  container_access: boolean | null;
  high_voltage: boolean | null;
  water_requirement: string | null;
  special_requirements: string | null;
  name: string;
  phone: string;
  line_id: string | null;
  status: BuyerRequirementStatus;
  consent_pdpa: boolean;
  consent_pdpa_at: string | null;
  consent_public: boolean;
  consent_public_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  published_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuyerRequirementSubmissionResult {
  status: Extract<BuyerRequirementStatus, "pending_review">;
  matches: { full: Land[]; near: Land[]; status: "available" | "limited" | "unavailable" };
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
