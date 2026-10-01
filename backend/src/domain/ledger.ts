/**
 * Payment ledger + provider abstraction — Plan §03 + §04.
 * - Authorize at booking (inside provider window), capture at completion.
 * - Never store raw cards; provider tokens only.
 * - Internal immutable ledger: gross, tax, platform fee, partner payable, refund, promo, payout ref.
 * - Amounts in integer minor units + currency. Idempotency keys required.
 * - Daily reconciliation hook (provider tx vs ledger).
 */

export type LedgerKind =
  | 'charge'
  | 'tax'
  | 'platform_fee'
  | 'partner_payable'
  | 'promo'
  | 'refund'
  | 'payout'
  | 'cancellation_fee';

export interface LedgerEntry {
  id: string;
  bookingId: string;
  kind: LedgerKind;
  amountMinor: number; // signed: charges/fees positive, refunds/payouts negative from platform view
  currency: string;
  idempotencyKey: string;
  providerRef?: string;
  approvedBy?: string;
  createdAt: string;
}

export interface Settlement {
  grossMinor: number;
  taxMinor: number;
  platformFeeMinor: number;
  partnerPayableMinor: number;
  promoMinor: number;
  currency: string;
}

export function computeSettlement(args: {
  totalCollectedMinor: number; // customer cash collected excl. pass-through tax
  taxMinor: number;
  platformFeeBps: number;
  partnerShareBps: number; // of (gross - fee)?
  promoMinor?: number;
  currency: string;
}): Settlement {
  const { totalCollectedMinor, taxMinor, platformFeeBps, partnerShareBps, currency } = args;
  if (!Number.isInteger(totalCollectedMinor) || totalCollectedMinor <= 0) throw new Error('gross must be positive int');
  const platformFeeMinor = Math.round((totalCollectedMinor * platformFeeBps) / 10000);
  const partnerPayableMinor = Math.round(((totalCollectedMinor - platformFeeMinor) * partnerShareBps) / 10000);
  const promoMinor = args.promoMinor ?? 0;
  return { grossMinor: totalCollectedMinor, taxMinor, platformFeeMinor, partnerPayableMinor, promoMinor, currency };
}

/** Contribution per completed wash (Plan §07). Positive by zone before expansion. */
export function contributionPerWash(args: {
  collectedMinor: number;
  partnerPayableMinor: number;
  paymentFeeMinor: number;
  consumablesMinor: number;
  variableSupportMinor: number;
  expectedRefundMinor: number;
  promoMinor: number;
}): number {
  const s = args;
  return (
    s.collectedMinor -
    s.partnerPayableMinor -
    s.paymentFeeMinor -
    s.consumablesMinor -
    s.variableSupportMinor -
    s.expectedRefundMinor -
    s.promoMinor
  );
}

// Replaceable provider interface (Stripe/Razorpay/etc. behind this seam)
export interface PaymentProvider {
  name: string;
  authorize(args: { bookingId: string; amountMinor: number; currency: string; token: string; idempotencyKey: string }): Promise<{ providerRef: string }>;
  capture(args: { providerRef: string; amountMinor: number; idempotencyKey: string }): Promise<{ capturedRef: string }>;
  refund(args: { providerRef: string; amountMinor: number; reason: string; idempotencyKey: string }): Promise<{ refundRef: string }>;
}

/** In-memory fake provider for pilot/sandbox certification (Plan §08). */
export class FakePaymentProvider implements PaymentProvider {
  name = 'fake-sandbox';
  private auths = new Map<string, number>();
  async authorize(args: { bookingId: string; amountMinor: number; currency: string; token: string; idempotencyKey: string }) {
    if (!args.token.startsWith('tok_')) throw new Error('invalid provider token');
    const ref = `auth_${args.bookingId}_${args.idempotencyKey}`.slice(0, 64);
    this.auths.set(ref, args.amountMinor);
    return { providerRef: ref };
  }
  async capture(args: { providerRef: string; amountMinor: number; idempotencyKey: string }) {
    const authed = this.auths.get(args.providerRef);
    if (authed === undefined) throw new Error('unknown authorization');
    if (args.amountMinor > authed) throw new Error('capture exceeds authorization');
    return { capturedRef: `cap_${args.idempotencyKey}`.slice(0, 64) };
  }
  async refund(args: { providerRef: string; amountMinor: number; reason: string; idempotencyKey: string }) {
    if (!args.reason?.trim()) throw new Error('refund reason required');
    return { refundRef: `ref_${args.idempotencyKey}`.slice(0, 64) };
  }
}
