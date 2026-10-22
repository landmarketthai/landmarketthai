import { NextRequest, NextResponse } from "next/server";
import { authorizedWorker, lineConfig } from "@/lib/line/delivery";
import { dispatchNotifications, notificationStats } from "@/lib/line/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Accepts no destination, message, lead ID or event from the caller.
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorizedWorker(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (!lineConfig()) return NextResponse.json({ error: "LINE delivery disabled or misconfigured" }, { status: 503, headers });
  try {
    const result = await dispatchNotifications();
    const stats = await notificationStats();
    console.info("[line-notifications] sweep", stats);
    return NextResponse.json({ ...result, ...stats }, { headers });
  } catch {
    console.error("[line-notifications] worker_unavailable");
    return NextResponse.json({ error: "Worker unavailable" }, { status: 503, headers });
  }
}

export const POST = GET;
