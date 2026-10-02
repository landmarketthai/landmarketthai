import { NextRequest, NextResponse } from "next/server";
import { resolveMapsInput } from "@/lib/google-maps-link";

// Turns a pasted Google Maps link or "lat,lng" into Thai coordinates for the /sell pin.
// Only allowlisted Google Maps hosts are ever fetched (see isAllowedMapsUrl); no API key, no geocoding.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { input?: unknown } | null;
  const input = typeof body?.input === "string" ? body.input.slice(0, 2048) : "";
  const result = await resolveMapsInput(input);
  return result.ok
    ? NextResponse.json({ lat: result.lat, lng: result.lng }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: 422, headers: { "Cache-Control": "no-store" } });
}
