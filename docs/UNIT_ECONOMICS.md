# Pilot dashboard & unit economics (Plan §07)

North star: **completed, on-time washes with positive contribution margin**. Report **by zone / package / window / cohort**.

| Measure | Definition | Pilot hypothesis |
|---|---|---|
| Fulfilment | completed / confirmed (excl. pre-dispatch customer cancels) | ≥ 90% after stabilization week; investigate every miss |
| On-time arrival | arrives in promised window / assigned | ≥ 85%; tune windows from measured road ETA |
| Rating | avg + count + distribution | ≥ 4.6/5 at 100+ responses |
| Rework/refund | rework or service refund / completed | < 5%; weekly reason review |
| Utilization | booked service time / available time by zone+shift | balance; don't market overloaded zones |
| Contribution margin | net revenue − payout − fees − supplies − refunds − support − promos | **positive by zone** before expansion (kit subsidies tracked separately) |
| Repeat | 30-day repeat; renewal/pause/cancel reasons | baseline in pilot |
| Safety/trust | incidents, claims, unresolved disputes, privacy complaints | **zero unresolved high-severity at any gate** |

```
contribution = collected (ex-tax) − partner_payable − payment_fee − consumables/water
               − variable_support − expected_refunds − promo
```

Review daily: funnel, unassigned, median/P90 ETA, cancels by reason, duration, photo exceptions, payment/payout exceptions, coverage, contribution/job, repeat. Set final targets with ops lead after 2 weeks baseline.

Live endpoint: `GET /v1/metrics/pilot`.
