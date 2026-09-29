import { NextRequest, NextResponse } from "next/server";
import {
  insertLead,
  insertReferralAttribution,
  resolveActivePartner,
} from "@/lib/neon/mutations";
import {
  buyerLeadSchema,
  normalizePhone,
  ownerLeadSchema,
  partnerLeadSchema,
} from "@/lib/validations";
import type { LeadType } from "@/lib/types/database";

const MAX_BODY = 10_000;
const RATE_LIMIT = 10;
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
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, lead_type: leadType, name }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[n8n] webhook failed lead_id=${leadId} lead_type=${leadType} status=${response.status} body=${body}`,
      );
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    if (isTimeout) {
      console.error(`[n8n] webhook timed out lead_id=${leadId} lead_type=${leadType}`);
    } else {
      console.error(`[n8n] webhook error lead_id=${leadId} lead_type=${leadType}`, error);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const text = await req.text();
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const body = JSON.parse(text) as Record<string, unknown>;
    if (body._hp) return NextResponse.json({ ok: true });

    if (typeof body.phone === "string") {
      body.phone = normalizePhone(body.phone);
    }

    const leadType = body.lead_type;
    let parsed: Record<string, unknown>;
    let details: Record<string, unknown> = {};

    if (leadType === "buyer") {
      const result = buyerLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
      }
      const { name, phone, line_id, referral_code, source, consent_pdpa, ...buyerDetails } = result.data;
      parsed = { name, phone, line_id, referral_code, source, consent_pdpa };
      details = buyerDetails;
    } else if (leadType === "partner") {
      const result = partnerLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: result.error.flatten() }, { status: 422 });
      }
      const { name, phone, line_id, referral_code, source, consent_pdpa, ...partnerDetails } = result.data;
      parsed = { name, phone, line_id, referral_code, source, consent_pdpa };
      details = partnerDetails;
    } else if (leadType === "owner") {
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

    const normalizedType = leadType as LeadType;
    const rawReferralCode = parsed.referral_code as string | undefined;
    let validatedReferralCode: string | null = null;
    let partnerId: string | null = null;

    if (rawReferralCode) {
      partnerId = await resolveActivePartner(rawReferralCode);
      if (partnerId) {
        validatedReferralCode = rawReferralCode;
      } else {
        details = { ...details, raw_referral_code: rawReferralCode };
      }
    }

    const leadId = await insertLead({
      leadType: normalizedType,
      name: parsed.name as string,
      phone: parsed.phone as string,
      lineId: (parsed.line_id as string | undefined) ?? null,
      referralCode: validatedReferralCode,
      source: (parsed.source as string | undefined) ?? req.headers.get("referer") ?? null,
      details,
      consentPdpa: Boolean(parsed.consent_pdpa),
      consentAt: parsed.consent_pdpa ? new Date().toISOString() : null,
    });

    if (validatedReferralCode && partnerId && normalizedType !== "partner") {
      try {
        await insertReferralAttribution({
          leadId,
          referralCode: validatedReferralCode,
          partnerId,
          entityType: normalizedType === "owner" ? "owner" : "buyer",
        });
      } catch (error) {
        console.error("Referral attribution insert error:", error);
      }
    }

    await fireWebhook(leadId, normalizedType, parsed.name as string);
    return NextResponse.json({ ok: true, id: leadId });
  } catch (error) {
    console.error("Lead route error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
