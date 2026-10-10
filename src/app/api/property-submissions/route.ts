import { NextRequest, NextResponse } from "next/server";
import { createPropertyDraft } from "@/lib/neon/marketplace";
import { guardPublicWrite } from "@/lib/security/http";

export async function POST(request: NextRequest) {
  // Strict: a tokenless bot spread over many IPs must be rejected before it can drain the global draft quota.
  const blocked = await guardPublicWrite(request, "property_draft_create", { human: "strict" });
  if (blocked) return blocked;

  try {
    const draft = await createPropertyDraft();
    return NextResponse.json(draft, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Create property draft error:", error);
    return NextResponse.json({ error: "Unable to create draft" }, { status: 500 });
  }
}
