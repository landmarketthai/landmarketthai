export type LandType =
  | "land"
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
export type PropertyType = "land" | "factory" | "warehouse";
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
export type DemandStatus = "active" | "matched" | "closed";
export type DealStatus = "in_progress" | "closed" | "cancelled";
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
  subdistrict: string | null;
  address: string | null;
  land_type: LandType;
  property_type: PropertyType;
  transaction_type: TransactionType;
  size_rai: number | null;
  area_rai: number | null;
  area_ngan: number | null;
  area_sqwa: number | null;
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
  land_id: string;
  buyer_lead_id: string | null;
  partner_id: string | null;
  referral_code: string | null;
  deal_value: number;
  commission_paid: number | null;
  status: DealStatus;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
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
  province?: Province;
}

export interface BuyerRequirement {
  id: string;
  lead_id: string | null;
  property_type: PropertyType | null;
  transaction_type: TransactionType;
  preferred_locations: string[];
  province_ids: string[];
  min_size_rai: number | null;
  max_size_rai: number | null;
  max_price: number | null;
  max_price_per_rai: number | null;
  zoning: ZoningColor | null;
  purpose: string | null;
  container_access: boolean | null;
  high_voltage: boolean | null;
  water_requirement: string | null;
  name: string;
  phone: string;
  line_id: string | null;
  status: DemandStatus;
  created_at: string;
  updated_at: string;
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
