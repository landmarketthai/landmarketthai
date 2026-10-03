import { NextRequest, NextResponse } from "next/server";
import { insertEvent } from "@/lib/neon/mutations";
import { z } from "zod";

const headers = { "Cache-Control": "no-store" };

// Public analytics only. Trusted audit events use insertEvent directly on the server.
const schema = z.object({
  event_type: z.enum(["page_view", "search", "listing_view", "contact_click"]),
  entity_type: z.enum(["page", "search", "listing", "contact"]).optional(),
  entity_id: z.string().uuid().optional(),
  session_id: z.string().max(100).optional(),
  // Zod strips all unlisted keys, including actor/admin IDs and override claims.
  meta: z.object({
    path: z.string().max(500).optional(),
    query: z.string().max(200).optional(),
    contact_method: z.enum(["phone", "line", "email"]).optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) return NextResponse.json({ ok: true }, { headers });

    await insertEvent({
      eventType: result.data.event_type,
      entityType: result.data.entity_type,
      entityId: result.data.entity_id,
      sessionId: result.data.session_id,
      meta: result.data.meta ?? {},
    });

    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: true }, { headers });
  }
}
