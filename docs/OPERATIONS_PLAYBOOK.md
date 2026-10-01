# Operations playbook draft (Plan §05 + §08)

Staffed pilot support during **all bookable hours**. Live exception queue: unassigned, late, failed-payment, unsafe-site, damage.

## Partner readiness
Verify identity, payout account, business docs, eligibility; record expiries + owners. Train: packages, comms, chemical handling (SDS), photo evidence, vehicle access, site permissions, escalation. Standard kit: cleaners, towels, PPE, power/water gear, waste containment, replenishment checklist. Observed practical before activation. Suspend offers on expired cert/kit/insurance.

## Quality & damage (human-led)
Guided pre-photos before work + after-photos before close (lighting/angle/identity). Customer confirms condition when present; no-contact flow needs proof + support route. Dispute: evidence freeze, deadlines, insurer/partner escalation, refund authority, customer updates. Image models may triage later — never decide liability. Sample jobs, coach defects, pause after serious incidents.

## Water / site / environment
Map permitted methods per site type with local advisers + property operators (water-use, runoff, chemical storage/disposal, access, noise). No blanket water-saving % claim unless measured. App blocks unsafe/unpermitted service or offers another location/method.

## Privacy, security, support
Precise location only on-shift/active work; onboarding explanation + visible off-duty state. Least-privilege + MFA + encrypted transport/storage + managed secrets + admin logs + breach contact tree. Masked call/chat only for active booking + short support window; fast unsafe/damage/emergency action; honest ETAs; notify on assignment/delay/arrival/start/complete/cancel.

## Controls available in this build
- `POST /v1/bookings/:id/transitions {to: reassigned/cancelled_*/refunded, actor: operator, reason}` (audited)
- Pause partner = partner status → `suspended` (DB) → excluded from eligibility
- Pause zone = `withinOpenHours=false` for dispatch requests in that zone
- Refunds: `POST /v1/payments/refund` with approver + reason → ledger + audit
