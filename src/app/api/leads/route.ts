import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  buyerLeadSchema,
  partnerLeadSchema,
  ownerLeadSchema,
  normalizePhone,
} from "@/lib/validations";

const MAX_BODY = 10_000;

// ponytail: in-memory per-IP rate limit — per-instance only; move to Vercel WAF
// or Upstash if spam outgrows this
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (rateBuckets.size > 10_000) rateBuckets.clear();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

async function fireWebhook(leadId: string, leadType: string, name: string): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_LEADS;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, lead_type: leadType, name }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[n8n] webhook failed lead_id=${leadId} lead_type=${leadType} status=${res.status} body=${text}`
      );
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    if (isTimeout) {
      console.error(`[n8n] webhook timed out lead_id=${leadId} lead_type=${leadType}`);
    } else {
      console.error(`[n8n] webhook error lead_id=${leadId} lead_type=${leadType}`, err);
    }
  }
}

type SupabaseClient = ReturnType<typeof createServerClient>;

async function resolveActivePartner(
  db: SupabaseClient,
  referralCode: string
): Promise<string | null> {
  const { data } = await db
    .from("partners")
    .select("id")
    .eq("referral_code", referralCode)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

async function insertAttribution(
  db: SupabaseClient,
  leadId: string,
  leadType: string,
  referralCode: string,
  partnerId: string,
  entityType: "buyer" | "owner"
): Promise<void> {
  const { error } = await db.from("referral_attributions").insert({
    referral_code: referralCode,
    lead_id: leadId,
    partner_id: partnerId,
    entity_type: entityType,
    first_touch_at: new Date().toISOString(),
  });
  if (error) {
    console.error(
      `[attribution] insert failed lead_id=${leadId} lead_type=${leadType} referral_code=${referralCode} partner_id=${partnerId} error=${error.message}`
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const text = await req.text();
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const body = JSON.parse(text);

    if (body._hp) {
      return NextResponse.json({ ok: true });
    }

    // Normalize phone before Zod validation so formatted inputs pass the regex
    if (typeof body.phone === "string") {
      body.phone = normalizePhone(body.phone);
    }

    const { lead_type } = body;

    let parsed: Record<string, unknown>;
    let details: Record<string, unknown> = {};

    if (lead_type === "buyer") {
      const result = buyerLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
      }
      const { name, phone, line_id, referral_code, source, consent_pdpa, ...buyerDetails } = result.data;
      parsed = { name, phone, line_id, referral_code, source, consent_pdpa };
      details = buyerDetails;
    } else if (lead_type === "partner") {
      const result = partnerLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
      }
      const { name, phone, line_id, referral_code, source, consent_pdpa, ...partnerDetails } = result.data;
      parsed = { name, phone, line_id, referral_code, source, consent_pdpa };
      details = partnerDetails;
    } else if (lead_type === "owner") {
      const result = ownerLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
      }
      const { name, phone, line_id, referral_code, source, consent_pdpa, ...ownerDetails } = result.data;
      parsed = { name, phone, line_id, referral_code, source, consent_pdpa };
      details = ownerDetails;
    } else {
      return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });
    }

    const db = createServerClient();

    // Resolve referral_code once before any DB write, for all lead types.
    // Valid codes are written to leads.referral_code; unresolved codes are demoted to
    // details.raw_referral_code so admins can review them without trusting forged input.
    // The resolved partnerId is reused for attribution — no second lookup needed.
    let validatedRefCode: string | null = null;
    let resolvedPartnerId: string | null = null;
    const rawRefCode = parsed.referral_code as string | undefined;

    if (rawRefCode) {
      resolvedPartnerId = await resolveActivePartner(db, rawRefCode);
      if (resolvedPartnerId) {
        validatedRefCode = rawRefCode;
      } else {
        details = { ...details, raw_referral_code: rawRefCode };
      }
    }

    const { data: lead, error } = await db
      .from("leads")
      .insert({
        lead_type,
        name: parsed.name,
        phone: parsed.phone,
        line_id: parsed.line_id ?? null,
        referral_code: validatedRefCode,
        source: (parsed.source as string) ?? req.headers.get("referer") ?? null,
        details,
        consent_pdpa: parsed.consent_pdpa,
        consent_at: parsed.consent_pdpa ? new Date().toISOString() : null,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Lead insert error:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // Create attribution only for buyer and owner leads, never for partner.
    // Uses the already-resolved partnerId — no second resolveActivePartner call.
    if (validatedRefCode && resolvedPartnerId && lead?.id && lead_type !== "partner") {
      await insertAttribution(
        db,
        lead.id,
        lead_type,
        validatedRefCode,
        resolvedPartnerId,
        lead_type === "owner" ? "owner" : "buyer"
      );
    }

    if (lead?.id) {
      await fireWebhook(lead.id, lead_type, parsed.name as string);
    }

    return NextResponse.json({ ok: true, id: lead?.id });
  } catch (err) {
    console.error("Lead route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
