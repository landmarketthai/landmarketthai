import { NextResponse } from 'next/server';
import { getSessionUser, isAdminUserAllowed } from '@/lib/auth/admin';

export const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
export async function partnerAdmin() {
  const user = await getSessionUser();
  if (!user) return { response: json({ error: 'Unauthorized' }, 401) };
  if (!isAdminUserAllowed(user)) return { response: json({ error: 'Forbidden' }, 403) };
  return { user };
}
export function operationError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === '40001') return json({ error: 'Deal changed. Reload before saving commission.' }, 409);
  if (code === 'P0002') return json({ error: 'Not found' }, 404);
  if (code === '22023') return json({ error: 'Invalid operation or commission amount' }, 400);
  return json({ error: 'Operation failed. Reload and try again.' }, 500);
}
