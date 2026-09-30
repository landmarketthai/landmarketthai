import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createSessionClient } from "@/lib/supabase/server";
import { isSameOriginMutation, parseSavedSearch, savedSearchDeleteSchema, savedSearchUpdateSchema } from "@/lib/saved-searches";

async function mutate(req: NextRequest, action: "save" | "update" | "delete") {
  if (!isSameOriginMutation(req.headers, req.nextUrl.origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await createSessionClient();
  if (!session) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let value;
  try {
    const text = await req.text();
    if (text.length > 5000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(text);
    value = action === "save" ? parseSavedSearch(body)
      : action === "update" ? savedSearchUpdateSchema.parse(body)
      : savedSearchDeleteSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid saved search" }, { status: 422 });
  }

  const db = createServerClient();
  const now = new Date().toISOString();
  const result = action === "save" && "search_params" in value
    ? await db.from("saved_searches").upsert({
        ...value,
        user_id: user.id,
        alert_requested_at: value.alert_requested ? now : null,
        updated_at: now,
      }, { onConflict: "user_id,search_params" }).select("id").single()
    : action === "update" && "alert_requested" in value && "id" in value
      ? await db.from("saved_searches").update({
          alert_requested: value.alert_requested,
          alert_requested_at: value.alert_requested ? now : null,
          updated_at: now,
        }).eq("id", value.id).eq("user_id", user.id).select("id").maybeSingle()
      : "id" in value
        ? await db.from("saved_searches").delete().eq("id", value.id).eq("user_id", user.id).select("id").maybeSingle()
        : null;
  if (!result || result.error) {
    console.error("Saved search mutation failed", result?.error?.code);
    return NextResponse.json({ error: "Unable to save changes" }, { status: 503 });
  }
  if (!result.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: result.data.id });
}

export async function POST(req: NextRequest) { return mutate(req, "save"); }
export async function PATCH(req: NextRequest) { return mutate(req, "update"); }
export async function DELETE(req: NextRequest) { return mutate(req, "delete"); }
