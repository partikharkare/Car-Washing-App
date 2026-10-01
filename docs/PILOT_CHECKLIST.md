# Go-live checklist (Plan §08) — closed pilot gate

Expand only after thresholds hold **two consecutive weeks** + zero unresolved high-severity incidents. One zone at a time.

- [ ] Legal/insurance/environment/employment/payments/privacy reviewed for launch geography
- [ ] Provider sandbox certified: auth, capture, cancel, refund, chargeback, payout, end-of-day reconciliation + live controlled transaction
- [ ] Catalog, inclusions/exclusions, price, quote expiry, windows, zone rules, customer notices approved by ops
- [ ] Partner checks, training, kit, evidence guide, safe-site policy, incident contacts active
- [ ] Support staffed every bookable hour; pause-zone / pause-partner / manual-recover proven
- [ ] Monitoring: job lifecycle, payment exceptions, queue delay, location freshness, crashes, upload failures, backups + restore drill
- [ ] Privacy: location+photo disclosure, retention schedule, access, deletion/contact process documented
- [ ] Pilot exit thresholds signed by product/engineering/ops

## Risks → controls in this build
Density → capped zones/hours, scheduled-first, manual dispatch. Damage → guided evidence + claims workflow + pause authority. Water/site → method matrix + block unsupported. No-show/late → offer expiry + stale-location signal + manual fallback. Money mismatch → sandbox + idempotent webhooks + daily ledger + exception queue. Privacy → on-shift-only location + minimal retention + RBAC. Spike/weather → capacity caps + pause + honest limits. No unvalidated surge.
