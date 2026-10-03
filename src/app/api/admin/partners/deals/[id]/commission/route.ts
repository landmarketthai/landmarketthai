import { partnerAdmin, json, operationError } from '@/lib/partners/api';
import { setCommission } from '@/lib/partners/server';
import { isPartnerId, validateCommission } from '@/lib/partners/helpers';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await partnerAdmin();
  if (admin.response) return admin.response;
  const { id } = await params;
  if (!isPartnerId(id)) return json({ error: 'Invalid ID' }, 400);
  let input;
  try { input = validateCommission(await request.json()); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid commission' }, 400); }
  try { return json({ deal: await setCommission(id, input, admin.user!.id) }); }
  catch (error) { return operationError(error); }
}
