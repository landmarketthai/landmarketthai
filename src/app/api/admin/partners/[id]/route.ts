import { partnerAdmin, json, operationError } from '@/lib/partners/api';
import { getPartnerDetail, changePartnerStatus } from '@/lib/partners/server';
import { isPartnerId } from '@/lib/partners/helpers';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const admin = await partnerAdmin();
  if (admin.response) return admin.response;
  const { id } = await params;
  if (!isPartnerId(id)) return json({ error: 'Invalid ID' }, 400);
  try {
    const detail = await getPartnerDetail(id);
    return detail ? json(detail) : json({ error: 'Not found' }, 404);
  } catch (error) { return operationError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  const admin = await partnerAdmin();
  if (admin.response) return admin.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isPartnerId(id) || !body || Object.keys(body).length !== 1 || !['active', 'inactive'].includes(body.status)) return json({ error: 'Invalid status or ID' }, 400);
  try { return json({ partner: await changePartnerStatus(id, body.status, admin.user!.id) }); }
  catch (error) { return operationError(error); }
}
