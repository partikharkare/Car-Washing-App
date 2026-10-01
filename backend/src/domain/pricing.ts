/**
 * Transparent quote / pricing engine — Plan §03.
 * quote = service base + vehicle tier + add-ons + zone/travel + taxes/fees - discounts
 * Amounts in integer minor units + currency. Ruleset version stored per line.
 */

export interface PriceLine {
  label: string;
  amountMinor: number;
  kind: 'base' | 'vehicle_tier' | 'addon' | 'travel' | 'tax' | 'fee' | 'discount';
  rulesetVersion: string;
}

export interface QuoteInput {
  currency: string;
  rulesetVersion: string;
  serviceBaseMinor: number;
  vehicleTierMinor: number;
  addonsMinor: { label: string; amountMinor: number }[];
  travelMinor: number;
  taxRateBps: number; // e.g. 500 = 5%
  feeMinor: number;
  discountMinor: number;
  expiresAt: string; // ISO
  includedTasks: string[];
  excludedTasks: string[];
  expectedDurationMin: number;
}

export interface Quote extends QuoteInput {
  id: string;
  lines: PriceLine[];
  totalMinor: number;
  createdAt: string;
  locked: boolean;
}

export const RULESET_VERSION = 'v1.0-pilot';

export function buildQuote(id: string, input: Omit<QuoteInput, 'rulesetVersion'> & { rulesetVersion?: string }): Quote {
  const rulesetVersion = input.rulesetVersion ?? RULESET_VERSION;
  for (const [k, v] of Object.entries({
    serviceBaseMinor: input.serviceBaseMinor,
    vehicleTierMinor: input.vehicleTierMinor,
    travelMinor: input.travelMinor,
    feeMinor: input.feeMinor,
    discountMinor: input.discountMinor,
  })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a non-negative integer (minor units)`);
  }
  if (input.discountMinor > input.serviceBaseMinor + input.vehicleTierMinor + input.addonsMinor.reduce((s, a) => s + a.amountMinor, 0) + input.travelMinor + input.feeMinor) {
    throw new Error('discount exceeds subtotal');
  }
  const lines: PriceLine[] = [
    { label: 'Service base', amountMinor: input.serviceBaseMinor, kind: 'base', rulesetVersion },
    { label: 'Vehicle tier', amountMinor: input.vehicleTierMinor, kind: 'vehicle_tier', rulesetVersion },
    ...input.addonsMinor.map((a): PriceLine => ({ label: a.label, amountMinor: a.amountMinor, kind: 'addon', rulesetVersion })),
    { label: 'Zone / travel', amountMinor: input.travelMinor, kind: 'travel', rulesetVersion },
    { label: 'Service fee', amountMinor: input.feeMinor, kind: 'fee', rulesetVersion },
  ];
  const subtotal = lines.reduce((s, l) => s + l.amountMinor, 0);
  const tax = Math.round((subtotal * input.taxRateBps) / 10000);
  lines.push({ label: `Tax (${input.taxRateBps / 100}%)`, amountMinor: tax, kind: 'tax', rulesetVersion });
  if (input.discountMinor > 0) {
    lines.push({ label: 'Discount', amountMinor: -input.discountMinor, kind: 'discount', rulesetVersion });
  }
  const totalMinor = subtotal + tax - input.discountMinor;
  if (totalMinor <= 0) throw new Error('total must be positive');
  if (Number.isNaN(Date.parse(input.expiresAt))) throw new Error('expiresAt must be ISO date');
  return {
    ...input,
    rulesetVersion,
    id,
    lines,
    totalMinor,
    createdAt: new Date().toISOString(),
    locked: true, // locked on acceptance; any change requires new quote + customer approval
  };
}

export function isQuoteExpired(q: Quote, now = new Date()): boolean {
  return new Date(q.expiresAt).getTime() <= now.getTime();
}
