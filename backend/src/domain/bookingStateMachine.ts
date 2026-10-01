/**
 * Booking state machine — Plan §01 + §04.
 * Enforced server-side. Client must not jump states (e.g. assigned -> paid).
 * Every transition is timestamped + attributed (actor).
 */

export type BookingStatus =
  | 'requested'
  | 'quote_accepted'
  | 'dispatching'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'in_service'
  | 'completed'
  | 'payment_captured'
  | 'payout_eligible'
  // exception / terminal branches
  | 'offer_expired'
  | 'cancelled_customer'
  | 'cancelled_no_show_partner'
  | 'unsafe_site'
  | 'payment_failed'
  | 'disputed'
  | 'refunded'
  | 'reassigned';

export type Actor = 'customer' | 'partner' | 'operator' | 'system';

export interface BookingTransition {
  from: BookingStatus;
  to: BookingStatus;
  actor: Actor[];
  /** operator must supply reason recorded in audit history */
  requiresReason?: boolean;
}

// Happy path + explicit exception branches (Plan §01)
const TRANSITIONS: BookingTransition[] = [
  { from: 'requested', to: 'quote_accepted', actor: ['customer'] },
  { from: 'quote_accepted', to: 'dispatching', actor: ['system', 'operator'] },
  { from: 'dispatching', to: 'assigned', actor: ['partner', 'operator', 'system'] },
  { from: 'assigned', to: 'en_route', actor: ['partner'] },
  { from: 'en_route', to: 'arrived', actor: ['partner'] },
  { from: 'arrived', to: 'in_service', actor: ['partner'] },
  { from: 'in_service', to: 'completed', actor: ['partner'] },
  { from: 'completed', to: 'payment_captured', actor: ['system', 'operator'] },
  { from: 'payment_captured', to: 'payout_eligible', actor: ['system', 'operator'] },
  // exceptions
  { from: 'dispatching', to: 'offer_expired', actor: ['system'] },
  { from: 'offer_expired', to: 'dispatching', actor: ['system', 'operator'] }, // retry / widen search
  { from: 'dispatching', to: 'reassigned', actor: ['operator', 'system'], requiresReason: true },
  { from: 'assigned', to: 'reassigned', actor: ['operator', 'system'], requiresReason: true },
  { from: 'en_route', to: 'reassigned', actor: ['operator', 'system'], requiresReason: true },
  { from: 'reassigned', to: 'dispatching', actor: ['system', 'operator'] },
  { from: 'requested', to: 'cancelled_customer', actor: ['customer', 'operator'], requiresReason: false },
  { from: 'quote_accepted', to: 'cancelled_customer', actor: ['customer', 'operator'] },
  { from: 'dispatching', to: 'cancelled_customer', actor: ['customer', 'operator'] },
  { from: 'assigned', to: 'cancelled_customer', actor: ['customer', 'operator'], requiresReason: true },
  { from: 'en_route', to: 'cancelled_customer', actor: ['customer', 'operator'], requiresReason: true },
  { from: 'assigned', to: 'cancelled_no_show_partner', actor: ['operator', 'system'], requiresReason: true },
  { from: 'en_route', to: 'cancelled_no_show_partner', actor: ['operator', 'system'], requiresReason: true },
  { from: 'arrived', to: 'unsafe_site', actor: ['partner', 'operator'], requiresReason: true },
  { from: 'en_route', to: 'unsafe_site', actor: ['partner', 'operator'], requiresReason: true },
  { from: 'completed', to: 'payment_failed', actor: ['system'] },
  { from: 'payment_failed', to: 'payment_captured', actor: ['system', 'operator'] }, // retry
  { from: 'completed', to: 'disputed', actor: ['customer', 'operator'] },
  { from: 'payment_captured', to: 'disputed', actor: ['customer', 'operator'] },
  { from: 'disputed', to: 'refunded', actor: ['operator'], requiresReason: true },
  { from: 'payment_captured', to: 'refunded', actor: ['operator'], requiresReason: true },
  { from: 'completed', to: 'refunded', actor: ['operator'], requiresReason: true },
];

const map = new Map<string, BookingTransition>();
for (const t of TRANSITIONS) map.set(`${t.from}->${t.to}`, t);

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  const t = map.get(`${from}->${to}`);
  return !!t && t.actor.includes(actor);
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: Actor, reason?: string): void {
  const t = map.get(`${from}->${to}`);
  if (!t || !t.actor.includes(actor)) {
    throw new Error(`Illegal booking transition ${from} -> ${to} by ${actor}`);
  }
  if (t.requiresReason && !reason?.trim()) {
    throw new Error(`Transition ${from} -> ${to} requires an operator reason (audit history)`);
  }
}

export function allowedTargets(from: BookingStatus): BookingStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}
