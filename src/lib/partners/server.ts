import { getSql } from '@/lib/neon/server';
import type { CommissionDeal } from './helpers';

export interface Partner {
  id: string; lead_id: string | null; name: string; phone: string; line_id: string | null;
  referral_code: string; working_area: string | null; experience: string | null; network_size: string | null;
  status: 'pending' | 'active' | 'inactive'; total_paid: string;
}
export interface PartnerRow extends Partner {
  lead_count: number; converted_count: number; open_count: number; won_count: number;
  expected: string; paid: string; payable: string; projected: string;
}
export interface PartnerLead { id: string; name: string; phone: string; line_id: string | null; status: string; details: Record<string, unknown> }
export interface PartnerDeal extends CommissionDeal { id: string; referral_code: string | null }
export interface Attribution {
  id: string; lead_id: string; name: string; entity_type: string; first_touch_at: string;
  converted: boolean; deal_id: string | null; stage: string | null; won: boolean;
}

export async function getPartners(): Promise<PartnerRow[]> {
  // ponytail: V1 loads the staff roster in one request; paginate if roster size makes this slow.
  const rows = await getSql().query(`select p.*,
    a.lead_count::int, a.converted_count::int, d.open_count::int, d.won_count::int,
    d.expected::text, d.paid::text, d.payable::text, d.projected::text
    from partners p
    cross join lateral (select count(distinct a.lead_id) lead_count,
      count(distinct a.lead_id) filter(where a.converted and linked.stage::text = 'won') converted_count
      from referral_attributions a left join deals linked on linked.id = a.deal_id
      where a.partner_id = p.id or (a.partner_id is null and a.referral_code = p.referral_code)) a
    cross join lateral (select
      count(*) filter(where stage::text not in ('won','lost','cancelled') and status::text = 'in_progress') open_count,
      count(*) filter(where stage::text = 'won') won_count,
      coalesce(sum(expected_commission),0) expected, coalesce(sum(commission_paid),0) paid,
      coalesce(sum(greatest(coalesce(expected_commission,0) - coalesce(commission_paid,0),0)) filter(where stage::text = 'won'),0) payable,
      coalesce(sum(expected_commission) filter(where stage::text not in ('won','lost','cancelled') and status::text = 'in_progress'),0) projected
      from deals where partner_id = p.id) d
    order by p.created_at desc, p.id`);
  return rows as PartnerRow[];
}
export async function getUnconvertedLeads(): Promise<PartnerLead[]> {
  return await getSql().query(`select l.id, l.name, l.phone, l.line_id, l.status, l.details from leads l
    where lead_type = 'partner' and not exists(select 1 from partners p where p.lead_id = l.id)
    order by l.created_at, l.id`) as PartnerLead[];
}
export async function getPartnerDetail(id: string) {
  const sql = getSql();
  const partners = await sql.query('select * from partners where id = $1', [id]);
  if (!partners.length) return null;
  const partner = partners[0] as Partner;
  const [attributions, deals] = await Promise.all([
    sql.query(`select a.*, l.name, d.stage, coalesce(a.converted and d.stage::text = 'won',false) won
      from referral_attributions a join leads l on l.id = a.lead_id left join deals d on d.id = a.deal_id
      where a.partner_id = $1 or (a.partner_id is null and a.referral_code = $2)
      order by a.first_touch_at desc, a.id`, [id, partner.referral_code]),
    sql.query(`select id, stage, status, referral_code, expected_commission::text, commission_paid::text
      from deals where partner_id = $1 order by created_at desc, id`, [id]),
  ]);
  return { partner, attributions: attributions as Attribution[], deals: deals as PartnerDeal[] };
}
export async function convertPartner(leadId: string, actorId: string): Promise<Partner> {
  const rows = await getSql().query('select * from operations_convert_partner($1::uuid,$2::text)', [leadId, actorId]);
  return rows[0] as Partner;
}
export async function changePartnerStatus(id: string, status: string, actorId: string): Promise<Partner> {
  const rows = await getSql().query('select * from operations_partner_status($1::uuid,$2::text,$3::text)', [id, status, actorId]);
  return rows[0] as Partner;
}
export async function setCommission(id: string, input: { expected_commission: string | null; commission_paid: string; override: boolean }, actorId: string) {
  const rows = await getSql().query('select * from operations_deal_commission($1::uuid,$2::numeric,$3::numeric,$4::boolean,$5::text)',
    [id, input.expected_commission, input.commission_paid, input.override, actorId]);
  return rows[0];
}
