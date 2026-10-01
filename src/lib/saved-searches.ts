import { z } from "zod";
import { landSearchParams, parseLandSearchParams } from "@/lib/land-search";

export const SAVED_SEARCH_ALERT_NOTICE = "บันทึกตัวกรองและความสนใจเฉพาะในเบราว์เซอร์นี้ ไม่ซิงก์ข้ามอุปกรณ์ ขณะนี้ยังไม่มีการส่งอีเมลหรือ LINE อัตโนมัติ เปิดผลการค้นหาเพื่อดูประกาศล่าสุด";

export interface SavedSearch {
  id: string;
  name: string;
  search_params: string;
  alert_requested: boolean;
  created_at: string;
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  search_params: z.string().max(4000),
  alert_requested: z.boolean(),
}).strict();

export const savedSearchUpdateSchema = z.object({
  id: z.uuid(),
  alert_requested: z.boolean(),
}).strict();

export const savedSearchDeleteSchema = z.object({ id: z.uuid() }).strict();

export function isSameOriginMutation(headers: Headers, fallbackOrigin: string): boolean {
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = headers.get("x-forwarded-host")?.split(",")[0].trim()
      || headers.get("host") || new URL(fallbackOrigin).host;
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch { return false; }
}

// Reuse the listing parser so stored searches have exactly the same meaning as /land.
export function parseSavedSearch(input: unknown) {
  const value = saveSchema.parse(input);
  const params = new URLSearchParams(value.search_params);
  const allowed = new Set(["province", "type", "q", "min_size", "max_size", "min_price", "max_price", "zoning", "eec"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new Error("Invalid search parameters");
    }
  }
  const filters = parseLandSearchParams(Object.fromEntries(params));
  const canonical = landSearchParams(filters);
  canonical.delete("page");
  return { ...value, search_params: canonical.toString() };
}

const STORAGE_KEY = "landmarketthai.saved-searches.v1";
const storedSearchSchema = saveSchema.extend({ id: z.uuid(), created_at: z.iso.datetime() });

export function readSavedSearches(storage: Pick<Storage, "getItem"> = localStorage): SavedSearch[] {
  const items = z.array(storedSearchSchema).parse(JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]"));
  return items.map(({ id, created_at, ...input }) => ({ ...parseSavedSearch(input), id, created_at }));
}

export function writeSavedSearches(items: SavedSearch[], storage: Pick<Storage, "setItem"> = localStorage): void {
  const validated = z.array(storedSearchSchema).parse(items);
  storage.setItem(STORAGE_KEY, JSON.stringify(validated.map(({ id, created_at, ...input }) => ({ ...parseSavedSearch(input), id, created_at }))));
}

export function saveBrowserSearch(input: unknown, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  const value = parseSavedSearch(input);
  const items = readSavedSearches(storage);
  const existing = items.find(item => item.search_params === value.search_params);
  const saved = { ...value, id: existing?.id ?? crypto.randomUUID(), created_at: existing?.created_at ?? new Date().toISOString() };
  writeSavedSearches([saved, ...items.filter(item => item.id !== saved.id)], storage);
}
