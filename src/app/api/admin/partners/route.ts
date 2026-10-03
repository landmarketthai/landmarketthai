import { partnerAdmin, json, operationError } from '@/lib/partners/api';
import { getPartners, getUnconvertedLeads, convertPartner } from '@/lib/partners/server';
import { isPartnerId } from '@/lib/partners/helpers';

export async function GET() {
  const admin = await partnerAdmin();
  if (admin.response) return admin.response;
  try {
    const [partners, leads] = await Promise.all([getPartners(), getUnconvertedLeads()]);
    return json({ partners, leads });
  } catch (error) { return operationError(error); }
}
export async function POST(request: Request) {
  const admin = await partnerAdmin();
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || typeof body.lead_id !== 'string' || !isPartnerId(body.lead_id)) return json({ error: 'Invalid partner lead ID' }, 400);
  try { return json({ partner: await convertPartner(body.lead_id, admin.user!.id) }); }
  catch (error) { return operationError(error); }
}
