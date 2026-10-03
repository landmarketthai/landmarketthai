'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PartnerDeal } from '@/lib/partners/server';

export function PartnerAction({ id, status }: { id: string; status?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/partners${status ? `/${id}` : ''}`, {
        method: status ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status ? { status: status === 'active' ? 'inactive' : 'active' } : { lead_id: id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');
      if (!status) router.push(`/admin/partners/${result.partner.id}`);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  return <div><button className="btn-outline" disabled={busy} onClick={save}>{busy ? 'Saving…' : status ? (status === 'active' ? 'Deactivate' : 'Activate') : 'Approve partner'}</button>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}

export function CopyCode({ code }: { code: string }) {
  const [message, setMessage] = useState('');
  return <div className="my-4"><label className="label">Referral code<input className="input font-mono" readOnly value={code} onFocus={event => event.target.select()} /></label>
    <button className="btn-outline mt-2" onClick={async () => {
      try { await navigator.clipboard.writeText(code); setMessage('Copied'); }
      catch { setMessage('Select the code above and copy it.'); }
    }}>Copy referral code</button><span role="status" className="ml-3">{message}</span></div>;
}

export function CommissionForm({ deal }: { deal: PartnerDeal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/partners/deals/${deal.id}/commission`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_commission: String(data.get('expected')).trim() || null,
          commission_paid: String(data.get('paid')).trim(), override: data.get('override') === 'on' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');
      setMessage('Commission saved'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
    <label className="label">Expected commission (THB; blank = unknown)<input name="expected" className="input" inputMode="decimal" pattern="[0-9]{1,16}(\.[0-9]{1,2})?" defaultValue={deal.expected_commission ?? ''} disabled={busy} /></label>
    <label className="label">Cumulative paid commission (THB)<input name="paid" className="input" inputMode="decimal" pattern="[0-9]{1,16}(\.[0-9]{1,2})?" required defaultValue={deal.commission_paid ?? '0.00'} disabled={busy} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="override" disabled={busy} />Allow payment above expected (audit logged)</label>
    <button className="btn-outline" disabled={busy}>{busy ? 'Saving…' : 'Save commission'}</button>
    <p role="status" className="sm:col-span-2">{message}</p>
  </form>;
}
