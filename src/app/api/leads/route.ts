import { scheduleNotifications } from "@/lib/line/schedule";
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
import { guardPublicWrite, readJsonBody, tooLargeResponse } from "@/lib/security/http";

const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  try {
    const blocked = await guardPublicWrite(req, "leads", { human: true });
    if (blocked) return blocked;

    const { tooLarge, body: raw } = await readJsonBody(req, MAX_BODY_BYTES);
    if (tooLarge) return tooLargeResponse();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const body = raw as Record<string, unknown>;
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

    scheduleNotifications();
    return NextResponse.json({ ok: true, id: leadId });
  } catch (error) {
    console.error("Lead route error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
