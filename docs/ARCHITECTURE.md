# Architecture (Plan §02) — modular monolith first

Managed infra first; Kubernetes only when workload/compliance/deployment needs justify it.

```
mobile (Flutter, customer+partner flavors) ─┐
web-ops (React, RBAC + audit) ──────────────┼─▶ backend (TS modular monolith, REST + WS)
                                            │     ├─ identity / catalog / quotes / booking
                                            │     ├─ dispatch / partner / payment ledger
                                            │     └─ notification / support
                                            ├─ PostgreSQL + PostGIS (truth) + Redis (presence/offer locks/rate limits only)
                                            ├─ managed queue + transactional outbox
                                            └─ providers (abstracted): object storage, push, maps/ETA, payments, masked comms
```

- Runtime: managed hosting + managed DB + secrets manager + IaC, dev/staging/prod separation, central metrics/logs.
- Realtime: frequent location only on-shift/active job; WS for active trip + push/poll fallback; last-update time shown; stale GPS never presented as live.
- Resilience: idempotent booking/accept/capture/complete; bounded retries + DLQ + operator visibility; backup retention + restore drill before pilot; alert on booking/payment failures + queue delay.
- Scale trigger: split a module only on measured load / release cadence / isolation / team ownership. Keep Postgres transactions + event log authoritative in pilot.
