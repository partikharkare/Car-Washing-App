import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildQuote, isQuoteExpired, RULESET_VERSION } from './domain/pricing.js';
import { allowedTargets } from './domain/bookingStateMachine.js';
import type { BookingStatus } from './domain/bookingStateMachine.js';
import { filterEligible, rankCandidates, createOffers, acceptOffer } from './domain/dispatch.js';
import type { PartnerCandidate } from './domain/dispatch.js';
import { computeSettlement, FakePaymentProvider } from './domain/ledger.js';
import { store } from './store/memoryStore.js';

dotenv.config();

export const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// request-id + basic audit trail
app.use((req, _res, next) => {
  (req as any).requestId = req.header('x-request-id') ?? randomUUID();
  next();
});

const idempotency = (v: unknown) => z.string().min(8).max(128).parse(v);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'carwash-backend', version: '0.1.0', ruleset: RULESET_VERSION, time: new Date().toISOString() });
});

// ---- Quotes ----
const QuoteSchema = z.object({
  currency: z.string().length(3).default('INR'),
  serviceBaseMinor: z.number().int().nonnegative(),
  vehicleTierMinor: z.number().int().nonnegative(),
  addonsMinor: z.array(z.object({ label: z.string(), amountMinor: z.number().int().nonnegative() })).default([]),
  travelMinor: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(3000).default(0),
  feeMinor: z.number().int().nonnegative().default(0),
  discountMinor: z.number().int().nonnegative().default(0),
  expiresAt: z.string(),
  includedTasks: z.array(z.string()).default([]),
  excludedTasks: z.array(z.string()).default([]),
  expectedDurationMin: z.number().int().positive().default(60),
});

app.post('/v1/quotes', (req, res) => {
  try {
    const body = QuoteSchema.parse(req.body);
    const q = buildQuote(randomUUID(), body);
    store.quotes.set(q.id, q);
    res.status(201).json({ requestId: (req as any).requestId, quote: q });
  } catch (e: any) {
    res.status(400).json({ code: 'INVALID_QUOTE', message: e.message });
  }
});

// ---- Bookings ----
const BookingSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  zoneId: z.string().min(1),
  serviceType: z.string().min(1),
  quoteId: z.string().uuid(),
  scheduledStart: z.string(),
  idempotencyKey: z.string().min(8).max(128),
  paymentToken: z.string().optional(), // provider token (tok_...), never raw PAN
});

const provider = new FakePaymentProvider();

app.post('/v1/bookings', async (req, res) => {
  try {
    const body = BookingSchema.parse(req.body);
    idempotency(body.idempotencyKey);
    const quote = store.quotes.get(body.quoteId);
    if (!quote) return res.status(404).json({ code: 'QUOTE_NOT_FOUND', message: 'quote not found' });
    if (isQuoteExpired(quote)) return res.status(409).json({ code: 'QUOTE_EXPIRED', message: 'quote expired — rebuild quote' });
    const id = store.byIdempotency.get(body.idempotencyKey);
    if (id) return res.status(200).json({ requestId: (req as any).requestId, booking: store.bookings.get(id), deduped: true });

    const booking = {
      id: randomUUID(),
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      zoneId: body.zoneId,
      serviceType: body.serviceType,
      quoteId: quote.id,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      status: 'requested' as BookingStatus,
      scheduledStart: body.scheduledStart,
      idempotencyKey: body.idempotencyKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.createBooking(booking, quote);
    // quote_accepted + dispatching (system steps, timestamped + attributed)
    store.transition(booking.id, 'quote_accepted', 'customer');
    store.transition(booking.id, 'dispatching', 'system');
    res.status(201).json({ requestId: (req as any).requestId, booking: store.bookings.get(booking.id) });
  } catch (e: any) {
    res.status(400).json({ code: 'INVALID_BOOKING', message: e.message });
  }
});

app.get('/v1/bookings/:id', (req, res) => {
  const b = store.bookings.get(req.params.id);
  if (!b) return res.status(404).json({ code: 'NOT_FOUND', message: 'booking not found' });
  res.json({ booking: b, events: store.events.filter((e) => e.bookingId === b.id), allowedTargets: allowedTargets(b.status) });
});

const TransitionSchema = z.object({
  to: z.string(),
  actor: z.enum(['customer', 'partner', 'operator', 'system']),
  reason: z.string().optional(),
  partnerId: z.string().optional(),
});

app.post('/v1/bookings/:id/transitions', (req, res) => {
  try {
    const body = TransitionSchema.parse(req.body);
    const b = store.bookings.get(req.params.id);
    if (!b) return res.status(404).json({ code: 'NOT_FOUND', message: 'booking not found' });
    const updated = store.transition(b.id, body.to as BookingStatus, body.actor, body.reason);
    if (body.to === 'assigned' && body.partnerId) store.assignPartner(b.id, body.partnerId);
    // capture on completion path: completed -> payment_captured handled via /payments/capture to keep money explicit
    res.json({ requestId: (req as any).requestId, booking: updated });
  } catch (e: any) {
    res.status(400).json({ code: 'ILLEGAL_TRANSITION', message: e.message });
  }
});

// ---- Dispatch ----
const DispatchSchema = z.object({
  bookingId: z.string().uuid(),
  zoneId: z.string(),
  serviceType: z.string(),
  requiredSkill: z.string(),
  siteRestrictionTags: z.array(z.string()).default([]),
  partnerBlockedTags: z.array(z.string()).default([]),
  withinOpenHours: z.boolean(),
  maxTravelMin: z.number().default(30),
  batchSize: z.number().int().min(1).max(5).default(2),
  ttlSec: z.number().int().min(30).max(600).default(120),
  payoutEstimateMinor: z.number().int().positive(),
  candidates: z.array(
    z.object({
      id: z.string(),
      zoneIds: z.array(z.string()),
      onShift: z.boolean(),
      status: z.enum(['active', 'suspended', 'offboarded']),
      skills: z.array(z.string()),
      equipmentOk: z.boolean(),
      capacityRemaining: z.number().int(),
      roadEtaMin: z.number(),
      reliabilityScore: z.number().min(0).max(1),
      offersToday: z.number().int().default(0),
      completedToday: z.number().int().default(0),
      lastSeenAt: z.string(),
    }),
  ),
});

app.post('/v1/dispatch/offers', (req, res) => {
  try {
    const body = DispatchSchema.parse(req.body);
    const eligible = filterEligible(body.candidates as PartnerCandidate[], body);
    const ranked = rankCandidates(eligible);
    const offers = createOffers(body.bookingId, ranked, {
      batchSize: body.batchSize,
      ttlSec: body.ttlSec,
      payoutEstimateMinor: body.payoutEstimateMinor,
      offerId: () => randomUUID(),
    });
    for (const o of offers) store.offers.set(o.id, o);
    res.status(201).json({ eligible: eligible.length, ranked: ranked.map((r) => ({ id: r.id, rankScore: r.rankScore })), offers });
  } catch (e: any) {
    res.status(400).json({ code: 'DISPATCH_ERROR', message: e.message });
  }
});

app.post('/v1/offers/:id/accept', (req, res) => {
  try {
    const all = [...store.offers.values()];
    const { winner, updated } = acceptOffer(all, req.params.id);
    for (const o of updated) store.offers.set(o.id, o);
    // atomic booking lock side-effect
    const booking = store.bookings.get(winner.bookingId);
    if (booking && booking.status === 'dispatching') {
      store.assignPartner(booking.id, winner.partnerId);
      store.transition(booking.id, 'assigned', 'partner');
    }
    res.json({ winner, booking: booking ? store.bookings.get(booking.id) : null });
  } catch (e: any) {
    res.status(409).json({ code: 'OFFER_REJECTED', message: e.message });
  }
});

// ---- Payments (sandbox provider; replaceable seam per plan) ----
app.post('/v1/payments/authorize', async (req, res) => {
  try {
    const s = z.object({ bookingId: z.string().uuid(), token: z.string(), idempotencyKey: z.string().min(8) }).parse(req.body);
    const b = store.bookings.get(s.bookingId);
    if (!b) return res.status(404).json({ code: 'NOT_FOUND', message: 'booking not found' });
    const r = await provider.authorize({ bookingId: b.id, amountMinor: b.totalMinor, currency: b.currency, token: s.token, idempotencyKey: s.idempotencyKey });
    res.json({ providerRef: r.providerRef });
  } catch (e: any) {
    res.status(400).json({ code: 'AUTH_FAILED', message: e.message });
  }
});

app.post('/v1/payments/capture', async (req, res) => {
  try {
    const s = z.object({ bookingId: z.string().uuid(), providerRef: z.string(), idempotencyKey: z.string().min(8) }).parse(req.body);
    const b = store.bookings.get(s.bookingId);
    if (!b) return res.status(404).json({ code: 'NOT_FOUND', message: 'booking not found' });
    if (b.status !== 'completed') return res.status(409).json({ code: 'NOT_COMPLETED', message: 'capture allowed only after completion' });
    const r = await provider.capture({ providerRef: s.providerRef, amountMinor: b.totalMinor, idempotencyKey: s.idempotencyKey });
    const st = computeSettlement({ totalCollectedMinor: b.totalMinor, taxMinor: 0, platformFeeBps: 1500, partnerShareBps: 7000, currency: b.currency });
    const now = new Date().toISOString();
    store.addLedger({ id: randomUUID(), bookingId: b.id, kind: 'charge', amountMinor: b.totalMinor, currency: b.currency, idempotencyKey: s.idempotencyKey, providerRef: r.capturedRef, createdAt: now });
    store.addLedger({ id: randomUUID(), bookingId: b.id, kind: 'partner_payable', amountMinor: st.partnerPayableMinor, currency: b.currency, idempotencyKey: `${s.idempotencyKey}:payable`, createdAt: now });
    store.transition(b.id, 'payment_captured', 'system');
    res.json({ capturedRef: r.capturedRef, settlement: st, booking: store.bookings.get(b.id) });
  } catch (e: any) {
    res.status(400).json({ code: 'CAPTURE_FAILED', message: e.message });
  }
});

app.post('/v1/payments/refund', async (req, res) => {
  try {
    const s = z.object({ bookingId: z.string().uuid(), providerRef: z.string(), amountMinor: z.number().int().positive(), reason: z.string(), approvedBy: z.string(), idempotencyKey: z.string().min(8) }).parse(req.body);
    const b = store.bookings.get(s.bookingId);
    if (!b) return res.status(404).json({ code: 'NOT_FOUND', message: 'booking not found' });
    const r = await provider.refund({ providerRef: s.providerRef, amountMinor: s.amountMinor, reason: s.reason, idempotencyKey: s.idempotencyKey });
    store.addLedger({ id: randomUUID(), bookingId: b.id, kind: 'refund', amountMinor: -s.amountMinor, currency: b.currency, idempotencyKey: s.idempotencyKey, providerRef: r.refundRef, approvedBy: s.approvedBy, createdAt: new Date().toISOString() });
    if (b.status === 'payment_captured' || b.status === 'completed' || b.status === 'disputed') {
      store.transition(b.id, 'refunded', 'operator', s.reason);
    }
    res.json({ refundRef: r.refundRef, booking: store.bookings.get(b.id) });
  } catch (e: any) {
    res.status(400).json({ code: 'REFUND_FAILED', message: e.message });
  }
});

// ---- Pilot metrics (Plan §07) ----
app.get('/v1/metrics/pilot', (_req, res) => {
  const all = [...store.bookings.values()];
  const completed = all.filter((b) => ['completed', 'payment_captured', 'payout_eligible', 'refunded'].includes(b.status)).length;
  const confirmed = all.filter((b) => b.status !== 'requested').length;
  res.json({
    bookings: all.length,
    fulfilment: confirmed ? completed / confirmed : 0,
    ledgerEntries: store.ledger.length,
    outboxPending: store.outbox.filter((o) => !o.delivered).length,
    targets: { fulfilment: '>=0.90', onTime: '>=0.85', rating: '>=4.6', rework: '<0.05' },
    note: 'Report by zone/service/window/partner cohort — overall averages conceal unworkable zones (§07).',
  });
});

// provider webhook stub: verify signature, dedupe, persist-before-process
app.post('/v1/webhooks/payments', (req, res) => {
  const sig = req.header('x-provider-signature');
  if (!sig) return res.status(401).json({ code: 'BAD_SIGNATURE', message: 'missing signature' });
  store.enqueue('provider.webhook', req.body);
  res.json({ received: true });
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`carwash-backend listening on :${port}`));
}
