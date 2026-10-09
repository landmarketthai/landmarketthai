import type { PropertySubmission, ZoningColor } from "./types/database";
import { getZoning, isZoningEmpty, zoningSchema, type ZoningInfo } from "@/lib/zoning";

/** Drafts saved before structured zoning carry only the legacy color; fold it in without claiming provenance. */
export function reconcileZoning<T extends { zoning: ZoningColor | null; zoning_info?: ZoningInfo | null }>(form: T): T & { zoning: ZoningColor | null; zoning_info: ZoningInfo } {
  const info = getZoning({ zoning: null, zoning_info: form.zoning_info ?? null });
  const color = info.zones.find(zone => zone.color)?.color ?? form.zoning ?? null;
  const zones = color && !info.zones.some(zone => zone.color) ? [{ color, type_code: "", type_name: "" }, ...info.zones] : info.zones;
  return { ...form, zoning: color, zoning_info: isZoningEmpty(info) && !color ? info : zoningSchema.parse({ ...info, zones }) };
}

export function phoneLooksValid(value: string): boolean {
  return /^0\d{8,9}$/.test(value.replace(/[\s\-().]/g, "").replace(/^\+?66(?=\d{9}$)/, "0"));
}

/** Omitted phones retain the saved value; incomplete edits remain in the local form. */
export function draftPatch<T extends { contact_phone: string }>(form: T, pricePerRai: number | null): string {
  return JSON.stringify({ ...form, contact_phone: form.contact_phone.trim() === "" || phoneLooksValid(form.contact_phone) ? form.contact_phone : undefined, price_per_rai: pricePerRai });
}

export function mergeDraft(current: PropertySubmission | null, incoming: PropertySubmission): PropertySubmission {
  return { ...current, ...incoming, media: incoming.media ?? current?.media };
}

/** Only a definitive missing draft permits replacing stored credentials. */
export async function loadSellerDraft(id: string, token: string, fetchImpl: typeof fetch = fetch): Promise<PropertySubmission | null> {
  const response = await fetchImpl(`/api/property-submissions/${id}`, { headers: { "x-draft-token": token }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("เปิดแบบร่างไม่สำเร็จ กรุณาลองอีกครั้ง");
  const body = await response.json() as { draft?: PropertySubmission | null };
  if (body.draft === null) return null;
  if (!body.draft?.id || !body.draft.status) throw new Error("ข้อมูลแบบร่างไม่ครบ กรุณาลองอีกครั้ง");
  return body.draft;
}
