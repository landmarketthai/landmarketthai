import type { PropertySubmission } from "./types/database";

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
