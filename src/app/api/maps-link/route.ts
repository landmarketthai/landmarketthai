import { NextRequest, NextResponse } from "next/server";
import { resolveMapsInput } from "@/lib/google-maps-link";
import { guardPublicWrite, readJsonBody, tooLargeResponse } from "@/lib/security/http";

// Turns a pasted Google Maps link or "lat,lng" into Thai coordinates for the /sell pin.
// Only allowlisted Google Maps hosts are ever fetched (see isAllowedMapsUrl); no API key, no geocoding.
export async function POST(request: NextRequest) {
  const blocked = await guardPublicWrite(request, "maps_link");
  if (blocked) return blocked;
  const read = await readJsonBody(request, 4_000);
  if (read.tooLarge) return tooLargeResponse();
  const body = read.body as { input?: unknown } | null;
  const input = typeof body?.input === "string" ? body.input.slice(0, 2048) : "";
  const result = await resolveMapsInput(input);
  return result.ok
    ? NextResponse.json({ lat: result.lat, lng: result.lng }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: 422, headers: { "Cache-Control": "no-store" } });
}
