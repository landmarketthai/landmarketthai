const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPartnerId(value: string) { return uuid.test(value); }

export function referralCode(leadId: string, attempt = 0): string {
  if (!isPartnerId(leadId) || !Number.isSafeInteger(attempt) || attempt < 0) throw new Error('Invalid referral code seed');
  return `LMT-${leadId.replaceAll('-', '').toUpperCase()}${attempt ? `-${attempt}` : ''}`;
}

// Decimal strings preserve numeric(18,2) precision across JSON and PostgreSQL.
export function moneyCents(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,16}(\.\d{1,2})?$/.test(value)) throw new Error('Use a non-negative decimal amount with at most two decimal places');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}
export function moneyText(cents: bigint): string {
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, '0')}`;
}
export interface CommissionInput { expected_updated_at: string; expected_commission: string | null; commission_paid: string; override: boolean }
export function validateCommission(input: unknown): CommissionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid commission input');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => !['expected_updated_at', 'expected_commission', 'commission_paid', 'override'].includes(key))) throw new Error('Unknown commission field');
  if (typeof row.expected_updated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(row.expected_updated_at) || !Number.isFinite(Date.parse(row.expected_updated_at))) {
    throw new Error('Expected deal version is required');
  }
  const paid = moneyCents(row.commission_paid);
  const expected = row.expected_commission === null ? null : moneyCents(row.expected_commission);
  if (row.override !== undefined && typeof row.override !== 'boolean') throw new Error('Override must be a boolean');
  if (expected !== null && paid > expected && row.override !== true) throw new Error('Paid commission exceeds expected; explicit override required');
  return { expected_updated_at: row.expected_updated_at, expected_commission: expected === null ? null : moneyText(expected), commission_paid: moneyText(paid), override: row.override === true };
}
export interface CommissionDeal { stage: string; status: string; expected_commission: string | null; commission_paid: string | null }
export function commissionSummary(deals: CommissionDeal[]) {
  let expected = BigInt(0), paid = BigInt(0), payable = BigInt(0), projected = BigInt(0);
  for (const deal of deals) {
    const estimate = moneyCents(deal.expected_commission ?? '0');
    const payment = moneyCents(deal.commission_paid ?? '0');
    expected += estimate; paid += payment;
    if (deal.stage === 'won') payable += estimate > payment ? estimate - payment : BigInt(0);
    else if (deal.status === 'in_progress' && deal.stage !== 'lost') projected += estimate;
  }
  return { expected: moneyText(expected), paid: moneyText(paid), payable: moneyText(payable), projected: moneyText(projected) };
}
