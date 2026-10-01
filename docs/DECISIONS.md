# Decisions & launch assumptions (Plan preface + §06 Phase 0)

## Starting assumptions (validate in discovery, weeks 1-2)
- Footprint: one city, 2–3 adjacent dense zones with clear boundaries. Expand one zone at a time.
- Service: mobile doorstep wash first. Outlet/POS later unless a signed anchor outlet needs it.
- Promise: scheduled slots baseline; on-demand only staffed hours + measured travel-time limits.
- Partners: verified independents; zones/hours/skills/equipment/payout terms explicit. Confirm worker classification + tax.
- Payments: locally supported marketplace-capable provider; integration replaceable (see `PaymentProvider` seam).
- Horizon: 22–24 week envelope for staffed MVP + closed pilot; re-estimate after sandbox + field trials.

## Required before engineering lock
- [ ] Geography, currency, service area, languages, payment methods
- [ ] Allowed wash methods per site (home/apartment/basement/commercial); who supplies water+power
- [ ] Verification, insurance limits, tax, refund policy, damage claims, settlement schedule
- [ ] Service packages/add-ons + operable promise

## Phase gates (see PLAN)
0 Validate (1–2) → 1 Foundation (1–4) → 2 MVP build (5–12) → 3 Internal alpha (13–15) → 4 Closed pilot (16–20) → 5 Soft launch (21–24).
This repo implements **Phase 1 Foundation exit**: prototype + state machine + zone model + data/privacy plan + vendor seams + pipeline + playbook draft.
