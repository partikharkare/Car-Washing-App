/**
 * Dispatch logic — Plan §03.
 * 1. Eligibility filter  2. Candidate ranking  3. Offer+lock  4. Promise+monitor  5. Recovery
 * Straight-line distance alone is NOT enough — use road ETA input.
 */

export interface PartnerCandidate {
  id: string;
  zoneIds: string[];
  onShift: boolean;
  status: 'active' | 'suspended' | 'offboarded';
  skills: string[]; // service types partner can do
  equipmentOk: boolean;
  capacityRemaining: number; // jobs they can still take this window
  roadEtaMin: number; // measured road ETA from maps provider
  reliabilityScore: number; // 0..1 predicted arrival reliability
  offersToday: number;
  completedToday: number;
  lastSeenAt: string; // ISO — for stale-location detection
}

export interface DispatchRequest {
  zoneId: string;
  serviceType: string;
  requiredSkill: string;
  siteRestrictionTags: string[]; // e.g. ['basement','no-water']
  partnerBlockedTags: string[]; // partner-declared limitations
  withinOpenHours: boolean;
  maxTravelMin: number;
  now?: Date;
}

export interface RankedCandidate extends PartnerCandidate {
  rankScore: number;
}

const STALE_LOCATION_MS = 2 * 60 * 1000; // 2 min freshness bar for live dispatch

export function isLocationStale(c: PartnerCandidate, now: Date = new Date()): boolean {
  return now.getTime() - new Date(c.lastSeenAt).getTime() > STALE_LOCATION_MS;
}

export function filterEligible(candidates: PartnerCandidate[], req: DispatchRequest, now: Date = new Date()): PartnerCandidate[] {
  return candidates.filter((c) => {
    if (!c.onShift) return false;
    if (c.status !== 'active') return false;
    if (!c.zoneIds.includes(req.zoneId)) return false;
    if (!req.withinOpenHours) return false;
    if (!c.skills.includes(req.requiredSkill)) return false;
    if (!c.equipmentOk) return false;
    if (c.capacityRemaining <= 0) return false;
    if (c.roadEtaMin > req.maxTravelMin) return false;
    if (isLocationStale(c, now)) return false; // stale GPS -> ops review, not auto-assign
    if (req.partnerBlockedTags.some((t) => req.siteRestrictionTags.includes(t))) return false;
    return true;
  });
}

/**
 * Rank by road ETA + reliability, then modest fairness for workload/history.
 * Lower rankScore = better.
 */
export function rankCandidates(eligible: PartnerCandidate[]): RankedCandidate[] {
  return eligible
    .map((c) => {
      const fairness = (c.offersToday - c.completedToday) * 0.5; // prefer under-offered partners slightly
      const rankScore = c.roadEtaMin * 2 - c.reliabilityScore * 10 + fairness;
      return { ...c, rankScore };
    })
    .sort((a, b) => a.rankScore - b.rankScore);
}

// --- Offer lock: first valid acceptance wins (atomic in Postgres via SELECT ... FOR UPDATE; here in-memory) ---

export interface DispatchOffer {
  id: string;
  bookingId: string;
  partnerId: string;
  payoutEstimateMinor: number;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export function createOffers(
  bookingId: string,
  ranked: RankedCandidate[],
  opts: { batchSize: number; ttlSec: number; payoutEstimateMinor: number; offerId: (i: number) => string; now?: Date },
): DispatchOffer[] {
  const now = opts.now ?? new Date();
  return ranked.slice(0, opts.batchSize).map((c, i) => ({
    id: opts.offerId(i),
    bookingId,
    partnerId: c.id,
    payoutEstimateMinor: opts.payoutEstimateMinor,
    expiresAt: new Date(now.getTime() + opts.ttlSec * 1000).toISOString(),
    status: 'pending' as const,
  }));
}

export function acceptOffer(
  offers: DispatchOffer[],
  offerId: string,
  now: Date = new Date(),
): { winner: DispatchOffer; updated: DispatchOffer[] } {
  const target = offers.find((o) => o.id === offerId);
  if (!target) throw new Error('offer not found');
  if (target.status !== 'pending') throw new Error('offer already resolved');
  if (new Date(target.expiresAt).getTime() <= now.getTime()) throw new Error('offer expired');
  if (offers.some((o) => o.status === 'accepted')) throw new Error('booking already locked by another partner');
  const updated = offers.map((o) => {
    if (o.id === offerId) return { ...o, status: 'accepted' as const };
    if (o.status === 'pending' && o.bookingId === target.bookingId) return { ...o, status: 'expired' as const };
    return o;
  });
  const winner = updated.find((o) => o.id === offerId)!;
  return { winner, updated };
}
