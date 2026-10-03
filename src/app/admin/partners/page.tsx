import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, isAdminUserAllowed } from '@/lib/auth/admin';
import { getPartners, getUnconvertedLeads } from '@/lib/partners/server';
import { PartnerAction } from './Controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Partner operations', robots: { index: false, follow: false } };
export default async function PartnersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin/partners');
  if (!isAdminUserAllowed(user)) return <main className="container-xl section"><h1>Access denied</h1></main>;
  const data = await Promise.all([getPartners(), getUnconvertedLeads()]).catch(() => null);
  if (!data) return <main className="container-xl section"><h1>Partner operations</h1><p role="alert">Unable to load partner records.</p><Link href="/admin/partners">Reload</Link></main>;
  const [partners, leads] = data;
  return <main className="container-xl section">
    <h1 className="text-3xl font-bold">Partner operations</h1>
    <p className="my-4 text-slate-600">Staff access only. Won deals are payable; open deals are projected. All amounts are THB.</p>
    <p className="mb-4 text-sm">Attributed leads count unique leads. Converted leads require an attribution marked converted and a linked won deal. Unknown commissions contribute zero to totals.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Partner referral and commission summary</caption>
      <thead><tr>{['Partner', 'Status', 'Referral code', 'Leads', 'Converted', 'Open deals', 'Won deals', 'Expected', 'Paid', 'Payable balance', 'Projected'].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{partners.map(p => <tr key={p.id} className="border-t">
        <td className="p-3"><Link className="underline" href={`/admin/partners/${p.id}`}>{p.name}</Link></td><td className="p-3">{p.status}</td><td className="p-3 font-mono">{p.referral_code}</td>
        {[p.lead_count, p.converted_count, p.open_count, p.won_count, p.expected, p.paid, p.payable, p.projected].map((value, index) => <td className="p-3" key={index}>{value}</td>)}
      </tr>)}</tbody>
    </table></div>
    {!partners.length && <p className="my-4">No partners yet.</p>}
    <h2 className="mt-8 text-xl font-bold">Partner leads awaiting conversion</h2>
    <p className="my-3 text-sm">Approval creates an active partner and sets the lead to qualified.</p>
    {!leads.length && <p>No unconverted partner leads.</p>}
    <ul className="space-y-4">{leads.map(lead => <li key={lead.id} className="rounded-xl border p-4">
      <p className="font-bold">{lead.name}</p><p>{lead.phone} · LINE: {lead.line_id || '—'} · {lead.status}</p>
      <p className="my-2 text-sm">Area: {String(lead.details.working_area ?? '—')} · Experience: {String(lead.details.experience ?? '—')} · Network: {String(lead.details.network_size ?? '—')}</p>
      <PartnerAction id={lead.id} />
    </li>)}</ul>
  </main>;
}
