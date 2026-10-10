import { zoningColors } from "@/lib/zoning";
import type { Land, Lead } from "@/lib/types/database";
import { buyerRequirementsSchema, type BuyerRequirements } from "@/lib/validations";
import { isUsableAreaOnly } from "@/lib/marketplace/search-filters";
import { distanceToAnchorKm, LOCATION_ANCHORS } from "@/lib/location-intelligence";

export interface MatchAssessment {
  score: number;
  reasons: string[];
  missingData: string[];
  requiresHumanApproval: true;
}

export interface BuyerMatch extends MatchAssessment { land: Land }
export type BuyerCandidate = Pick<Lead, "id" | "lead_type" | "status" | "details">;
export interface PropertyBuyerMatch extends MatchAssessment { buyer: BuyerCandidate }

function requirements(details: Record<string, unknown>): BuyerRequirements | null {
  const parsed = buyerRequirementsSchema.safeParse(details);
  if (!parsed.success) return null;
  const value = parsed.data;
  return Object.values(value).some((entry) => entry !== undefined && entry !== "") ? value : null;
}

function validNumber(value: unknown, allowZero = false): value is number {
  return typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}

function assess(land: Land, request: BuyerRequirements): MatchAssessment | null {
  if (land.status !== "active" || land.deleted_at) return null;
  let score = 0;
  const reasons: string[] = [];
  const missingData: string[] = [];
  function criterion(matches: boolean, points: number, penalty: number, reason: string) {
    score += matches ? points : -penalty;
    if (matches) reasons.push(reason);
  }
  function range(actual: unknown, bound: number | undefined, minimum: boolean, points: number, penalty: number, reason: string, missing: string, allowZero = false) {
    if (bound === undefined) return;
    if (!validNumber(actual, allowZero)) { missingData.push(missing); return; }
    criterion(minimum ? actual >= bound : actual <= bound, points, penalty, reason);
  }

  if (request.listing_id && (land.id === request.listing_id || land.slug === request.listing_id)) {
    score += 100;
    reasons.push("แปลงที่ Lead สนใจโดยตรง");
  }
  if (request.province?.trim()) {
    const province = request.province.trim().toLowerCase();
    if (!land.province) missingData.push("ยังไม่มีข้อมูลจังหวัด");
    else criterion([land.province.name_th, land.province.name_en, land.province.slug].some((name) => name.toLowerCase() === province), 35, 20, "จังหวัดตรง");
  }
  if (request.property_type) criterion(land.property_type === request.property_type, 25, 10, "ประเภททรัพย์ตรง");
  if (request.land_type) criterion(land.land_type === request.land_type || (request.land_type === "eec" && land.is_eec === true), 25, 10, "ประเภทที่ดินตรง");
  if (!isUsableAreaOnly(land)) {
    range(land.size_rai, request.size_min_rai, true, 10, 15, "ขนาดถึงขั้นต่ำ", "ยังไม่มีข้อมูลขนาด");
    range(land.size_rai, request.size_max_rai, false, 10, 15, "ขนาดไม่เกินที่ต้องการ", "ยังไม่มีข้อมูลขนาด");
  }
  range(land.usable_area_sqm, request.min_usable_area_sqm, true, 10, 15, "พื้นที่ใช้สอยถึงขั้นต่ำ", "ยังไม่มีข้อมูลพื้นที่ใช้สอย", true);
  range(land.usable_area_sqm, request.max_usable_area_sqm, false, 10, 15, "พื้นที่ใช้สอยไม่เกินที่ต้องการ", "ยังไม่มีข้อมูลพื้นที่ใช้สอย", true);
  range(land.total_price, request.budget_min, true, 10, 15, "ราคาไม่ต่ำกว่างบเริ่มต้น", "ยังไม่มีราคารวม");
  range(land.total_price, request.budget_max, false, 20, 25, "ราคาอยู่ในงบสูงสุด", "ยังไม่มีราคารวม");
  if (request.zoning) {
    if (!zoningColors(land).length) missingData.push("ยังไม่มีข้อมูลผังสี");
    else criterion(zoningColors(land).some(color => color === request.zoning), 20, 20, "ผังสีตรงตามข้อมูลประกาศ ต้องตรวจสอบก่อนใช้งาน");
  }
  if (request.is_eec !== undefined) {
    if (typeof land.is_eec !== "boolean") missingData.push("ยังไม่มีข้อมูล EEC");
    else criterion(land.is_eec === request.is_eec, 15, 15, "สถานะ EEC ตรงตามข้อมูลประกาศ ไม่ใช่การรับรองสิทธิ์");
  }
  range(land.frontage_m, request.frontage_min_m, true, 10, 10, "หน้ากว้างถึงขั้นต่ำ", "ยังไม่มีข้อมูลหน้ากว้าง", true);
  if (request.anchor_id && request.distance_max_km !== undefined) {
    const anchor = LOCATION_ANCHORS.find((entry) => entry.id === request.anchor_id)!;
    const distance = distanceToAnchorKm(land, anchor);
    if (distance === null) missingData.push("ยังไม่มีพิกัดเพียงพอสำหรับคำนวณระยะทาง");
    else {
      criterion(distance <= request.distance_max_km, 15, 15, `ระยะเส้นตรง ${distance.toFixed(1)} กม. อยู่ในระยะที่ต้องการ`);
      missingData.push("ระยะทางใช้พิกัดอ้างอิงโดยประมาณ ไม่ใช่ระยะขับรถ");
    }
  }
  return score > 0 ? { score, reasons, missingData: [...new Set(missingData)], requiresHumanApproval: true } : null;
}

function take<T>(items: T[], limit: number): T[] {
  return items.slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5);
}

/** Advisory rules only: no outreach, deal creation, or approval side effects. */
export function rankBuyerMatches(details: Record<string, unknown>, candidates: readonly Land[], limit = 5): BuyerMatch[] {
  const request = requirements(details);
  if (!request) return [];
  const matches = candidates.flatMap((land) => {
    const result = assess(land, request);
    return result ? [{ land, ...result }] : [];
  });
  const price = (land: Land) => validNumber(land.total_price) ? land.total_price : Infinity;
  return take(matches.sort((a, b) => b.score - a.score || (price(a.land) < price(b.land) ? -1 : price(a.land) > price(b.land) ? 1 : 0) || a.land.id.localeCompare(b.land.id)), limit);
}

/** Reverse ranking shares the exact forward assessment and excludes closed/nonbuyer leads. */
export function rankPropertyBuyers(land: Land, candidates: readonly BuyerCandidate[], limit = 5): PropertyBuyerMatch[] {
  const matches = candidates.flatMap((buyer) => {
    if (buyer.lead_type !== "buyer" || buyer.status === "won" || buyer.status === "lost") return [];
    const request = requirements(buyer.details);
    const result = request && assess(land, request);
    return result ? [{ buyer, ...result }] : [];
  });
  return take(matches.sort((a, b) => b.score - a.score || a.buyer.id.localeCompare(b.buyer.id)), limit);
}
