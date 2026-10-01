import { randomUUID } from 'node:crypto';
import type { BookingStatus, Actor } from '../domain/bookingStateMachine.js';
import { assertTransition } from '../domain/bookingStateMachine.js';
import type { Quote } from '../domain/pricing.js';
import type { DispatchOffer } from '../domain/dispatch.js';
import type { LedgerEntry as LE } from '../domain/ledger.js';

export interface Booking {
  id: string;
  customerId: string;
  vehicleId: string;
  zoneId: string;
  serviceType: string;
  quoteId: string;
  totalMinor: number;
  currency: string;
  status: BookingStatus;
  partnerId?: string;
  scheduledStart: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingEvent {
  id: string;
  bookingId: string;
  from: BookingStatus | null;
  to: BookingStatus;
  actor: Actor;
  reason?: string;
  at: string;
}

export interface OutboxItem {
  id: string;
  topic: string;
  payload: unknown;
  delivered: boolean;
  attempts: number;
  createdAt: string;
}

/**
 * In-memory store implementing the transactional-outbox + idempotency contract.
 * Postgres implementation must: wrap booking update + event + outbox insert in ONE transaction,
 * enforce UNIQUE(idempotency_key), and use SELECT ... FOR UPDATE for offer acceptance.
 */
export class MemoryStore {
  bookings = new Map<string, Booking>();
  byIdempotency = new Map<string, string>(); // idempotencyKey -> bookingId
  events: BookingEvent[] = [];
  quotes = new Map<string, Quote>();
  offers = new Map<string, DispatchOffer>();
  ledger: (LE & { bookingId: string })[] = [];
  ledgerKeys = new Set<string>();
  outbox: OutboxItem[] = [];
  audit: { at: string; actor: string; action: string; detail: unknown }[] = [];

  createBooking(b: Booking, initialQuote: Quote): Booking {
    if (this.byIdempotency.has(b.idempotencyKey)) {
      return this.bookings.get(this.byIdempotency.get(b.idempotencyKey)!)!;
    }
    this.bookings.set(b.id, b);
    this.byIdempotency.set(b.idempotencyKey, b.id);
    this.quotes.set(initialQuote.id, initialQuote);
    this.events.push({ id: randomUUID(), bookingId: b.id, from: null, to: b.status, actor: 'customer', at: new Date().toISOString() });
    this.enqueue('booking.created', { bookingId: b.id });
    return b;
  }

  transition(bookingId: string, to: BookingStatus, actor: Actor, reason?: string): Booking {
    const b = this.bookings.get(bookingId);
    if (!b) throw new Error('booking not found');
    assertTransition(b.status, to, actor, reason);
    const from = b.status;
    b.status = to;
    b.updatedAt = new Date().toISOString();
    this.events.push({ id: randomUUID(), bookingId, from, to, actor, reason, at: new Date().toISOString() });
    this.enqueue('booking.transition', { bookingId, from, to, actor });
    if (actor === 'operator') this.audit.push({ at: new Date().toISOString(), actor, action: `booking:${from}->${to}`, detail: { bookingId, reason } });
    return b;
  }

  assignPartner(bookingId: string, partnerId: string) {
    const b = this.bookings.get(bookingId);
    if (!b) throw new Error('booking not found');
    b.partnerId = partnerId;
    b.updatedAt = new Date().toISOString();
  }

  addLedger(e: LE & { bookingId: string }): void {
    if (this.ledgerKeys.has(e.idempotencyKey)) return; // idempotent replay
    this.ledgerKeys.add(e.idempotencyKey);
    this.ledger.push(e);
  }

  enqueue(topic: string, payload: unknown): void {
    this.outbox.push({ id: randomUUID(), topic, payload, delivered: false, attempts: 0, createdAt: new Date().toISOString() });
  }
}

export const store = new MemoryStore();
