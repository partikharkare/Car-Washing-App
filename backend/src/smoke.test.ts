import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition } from './domain/bookingStateMachine.js';
import { buildQuote } from './domain/pricing.js';
import { filterEligible, rankCandidates, createOffers, acceptOffer } from './domain/dispatch.js';
import { computeSettlement, contributionPerWash, FakePaymentProvider } from './domain/ledger.js';

describe('booking state machine', () => {
  it('allows happy path, blocks jumps', () => {
    assert.equal(canTransition('requested', 'quote_accepted', 'customer'), true);
    assert.equal(canTransition('assigned', 'payment_captured', 'partner'), false);
    assert.throws(() => assertTransition('assigned', 'payment_captured', 'partner'), /Illegal/);
    assert.throws(() => assertTransition('assigned', 'reassigned', 'operator'), /reason/);
    assert.doesNotThrow(() => assertTransition('assigned', 'reassigned', 'operator', 'partner offline'));
  });
});

describe('pricing', () => {
  it('builds transparent quote in minor units', () => {
    const q = buildQuote('q1', {
      currency: 'INR', serviceBaseMinor: 99900, vehicleTierMinor: 20000,
      addonsMinor: [{ label: 'Wax', amountMinor: 15000 }], travelMinor: 5000,
      taxRateBps: 500, feeMinor: 2000, discountMinor: 5000,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      includedTasks: ['foam wash'], excludedTasks: ['engine bay'], expectedDurationMin: 60,
    });
    assert.equal(q.locked, true);
    assert.ok(q.totalMinor > 0);
    assert.ok(q.lines.some((l) => l.kind === 'tax'));
  });
});

describe('dispatch', () => {
  const now = new Date();
  const base: any = {
    zoneIds: ['z1'], onShift: true, status: 'active', skills: ['doorstep-foam'],
    equipmentOk: true, capacityRemaining: 2, reliabilityScore: 0.9,
    offersToday: 1, completedToday: 1, lastSeenAt: now.toISOString(),
  };
  it('filters stale GPS + ranks by road ETA', () => {
    const cands = [
      { ...base, id: 'p1', roadEtaMin: 25 },
      { ...base, id: 'p2', roadEtaMin: 8 },
      { ...base, id: 'p3', roadEtaMin: 5, lastSeenAt: new Date(now.getTime() - 10 * 60000).toISOString() },
    ];
    const eligible = filterEligible(cands as any, { zoneId: 'z1', serviceType: 'foam', requiredSkill: 'doorstep-foam', siteRestrictionTags: [], partnerBlockedTags: [], withinOpenHours: true, maxTravelMin: 30 } as any, now);
    assert.deepEqual(eligible.map((c) => c.id).sort(), ['p1', 'p2']);
    const ranked = rankCandidates(eligible);
    assert.equal(ranked[0].id, 'p2');
  });
  it('first acceptance wins, others expire', () => {
    const ranked: any = [{ id: 'p1' }, { id: 'p2' }];
    const offers = createOffers('b1', ranked, { batchSize: 2, ttlSec: 120, payoutEstimateMinor: 50000, offerId: (i) => `o${i}`, now });
    const { winner, updated } = acceptOffer(offers, 'o0', now);
    assert.equal(winner.partnerId, 'p1');
    assert.equal(updated.find((o) => o.id === 'o1')!.status, 'expired');
    assert.throws(() => acceptOffer(updated, 'o1', now), /already resolved|already locked/);
  });
});

describe('ledger', () => {
  it('settlement + contribution math', () => {
    const s = computeSettlement({ totalCollectedMinor: 100000, taxMinor: 5000, platformFeeBps: 1500, partnerShareBps: 7000, currency: 'INR' });
    assert.ok(s.partnerPayableMinor > 0 && s.platformFeeMinor > 0);
    const c = contributionPerWash({ collectedMinor: 100000, partnerPayableMinor: s.partnerPayableMinor, paymentFeeMinor: 2000, consumablesMinor: 5000, variableSupportMinor: 1000, expectedRefundMinor: 1000, promoMinor: 0 });
    assert.ok(Number.isInteger(c));
  });
  it('fake provider authorize->capture->refund', async () => {
    const p = new FakePaymentProvider();
    const a = await p.authorize({ bookingId: 'b1', amountMinor: 100000, currency: 'INR', token: 'tok_test', idempotencyKey: 'k1' });
    const c = await p.capture({ providerRef: a.providerRef, amountMinor: 100000, idempotencyKey: 'k2' });
    assert.ok(c.capturedRef.startsWith('cap_'));
    await assert.rejects(() => p.authorize({ bookingId: 'b1', amountMinor: 1, currency: 'INR', token: 'raw-pan', idempotencyKey: 'k3' }), /token/);
  });
});
