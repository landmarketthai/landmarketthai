import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSessionUser, isAdminUserAllowed } from '@/lib/auth/admin';
import { getPartnerDetail } from '@/lib/partners/server';
import { isPartnerId, commissionSummary } from '@/lib/partners/helpers';
import { PartnerAction, CopyCode, CommissionForm } from '../Controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Partner detail', robots: { index: false, follow: false } };
export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin/partners');
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>Access denied</h1></main>;
  const { id } = await params;
  if (!isPartnerId(id)) notFound();
  let data;
  try { data = await getPartnerDetail(id); }
  catch { return <main className="container-xl section"><p role="alert">Unable to load partner.</p><Link href={`/admin/partners/${id}`}>Reload</Link></main>; }
  if (!data) notFound();
  const { partner: p, deals, attributions } = data;
  const summary = commissionSummary(deals);
  return <main className="container-xl section">
    <Link className="underline" href="/admin/partners">All partners</Link>
    <h1 className="mt-4 text-3xl font-bold">{p.name}</h1>
    <p className="my-3">{p.phone} · LINE: {p.line_id || '—'} · Status: {p.status}</p>
    <p>Area: {p.working_area || '—'} · Experience: {p.experience || '—'} · Network: {p.network_size || '—'}</p>
    <CopyCode code={p.referral_code} /><PartnerAction id={p.id} status={p.status} />
    <h2 className="mt-8 text-xl font-bold">Commission totals (THB)</h2>
    <dl className="my-4 grid gap-4 sm:grid-cols-4">{Object.entries(summary).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><dt className="capitalize">{label === 'payable' ? 'Payable balance' : label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
    <p className="text-sm">Won deals are payable. Open deals are projected only. Unknown expected amounts contribute zero; paid is cumulative across all linked deals.</p>
    <h2 className="mt-8 text-xl font-bold">Referral attributions</h2>
    {!attributions.length && <p className="my-3">No attributed leads.</p>}
    <ul className="my-4 space-y-3">{attributions.map(a => <li key={a.id} className="rounded-lg border p-4">
      <p>{a.name} · {a.entity_type} · <time dateTime={a.first_touch_at}>{a.first_touch_at}</time></p>
      <p className="text-sm">Lead: {a.lead_id}</p>
      <p>{a.won ? 'Converted won deal' : a.converted ? 'Marked converted; no linked won deal' : 'Attributed lead'}{a.deal_id && <> · <a className="underline" href={`#deal-${a.deal_id}`}>Deal {a.deal_id}</a> · {a.stage || 'Unknown stage'}</>}</p>
    </li>)}</ul>
    <h2 className="mt-8 text-xl font-bold">Linked deals</h2>
    {!deals.length && <p className="my-3">No linked deals.</p>}
    <ul className="my-4 space-y-4">{deals.map(deal => <li key={deal.id} id={`deal-${deal.id}`} className="rounded-xl border p-4">
      <h3 className="break-all font-bold">Deal {deal.id}</h3>
      <p>{deal.stage} · {deal.status} · {deal.stage === 'won' ? 'Payable' : deal.status === 'in_progress' && !['lost', 'cancelled'].includes(deal.stage) ? 'Projected only' : 'Closed without payable commission'}</p>
      <CommissionForm key={`${deal.id}:${deal.updated_at}`} deal={deal} />
    </li>)}</ul>
  </main>;
}
