import type { Land } from "@/lib/types/database";

export interface BuyerMatch {
  land: Land;
  score: number;
  reasons: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function provinceMatches(land: Land, requested: string): boolean {
  if (!requested || !land.province) return false;
  const needle = requested.toLowerCase();
  return [land.province.name_th, land.province.name_en, land.province.slug]
    .some((value) => value.toLowerCase() === needle);
}

export function rankBuyerMatches(details: Record<string, unknown>, candidates: Land[], limit = 5): BuyerMatch[] {
  const requestedListing = text(details.listing_id);
  const requestedProvince = text(details.province);
  const requestedType = text(details.land_type);
  const sizeMin = number(details.size_min_rai);
  const sizeMax = number(details.size_max_rai);
  const budgetMax = number(details.budget_max);

  const hasRequirements = Boolean(requestedListing || requestedProvince || requestedType || sizeMin || sizeMax || budgetMax);
  if (!hasRequirements) return [];

  return candidates
    .filter((land) => land.status === "active" && !land.deleted_at)
    .map((land) => {
      let score = 0;
      const reasons: string[] = [];

      if (requestedListing && (land.id === requestedListing || land.slug === requestedListing)) {
        score += 100;
        reasons.push("แปลงที่ Lead สนใจโดยตรง");
      }

      if (requestedProvince) {
        if (provinceMatches(land, requestedProvince)) {
          score += 35;
          reasons.push("จังหวัดตรง");
        } else {
          score -= 20;
        }
      }

      if (requestedType) {
        if (land.land_type === requestedType || (requestedType === "eec" && land.is_eec)) {
          score += 25;
          reasons.push("ประเภทที่ดินตรง");
        } else {
          score -= 10;
        }
      }

      if (sizeMin !== null) {
        if (land.size_rai >= sizeMin) {
          score += 10;
          reasons.push("ขนาดถึงขั้นต่ำ");
        } else {
          score -= 15;
        }
      }

      if (sizeMax !== null) {
        if (land.size_rai <= sizeMax) {
          score += 10;
          reasons.push("ขนาดไม่เกินที่ต้องการ");
        } else {
          score -= 15;
        }
      }

      const totalPrice = land.total_price === null ? null : Number(land.total_price);
      if (budgetMax !== null && totalPrice !== null && Number.isFinite(totalPrice)) {
        if (totalPrice <= budgetMax) {
          score += 20;
          reasons.push("ราคาอยู่ในงบสูงสุด");
        } else {
          score -= 25;
        }
      }

      return { land, score, reasons };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.land.total_price ?? Infinity) - Number(b.land.total_price ?? Infinity))
    .slice(0, Math.max(1, limit));
}
