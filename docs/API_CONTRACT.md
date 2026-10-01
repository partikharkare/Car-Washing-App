# API contract v1 (Plan §04)

Base: `/v1`. Versioned schemas, explicit error codes, `x-request-id`, rate limits, RBAC at every endpoint. Timestamps UTC ISO; amounts integer minor units + `currency`.

| Method | Endpoint | Auth/role | Notes |
|---|---|---|---|
| GET | `/health` | public | liveness |
| POST | `/v1/quotes` | customer | transparent lines + ruleset version + expiry; locks on acceptance |
| POST | `/v1/bookings` | customer | `idempotencyKey` required; auto `requested→quote_accepted→dispatching` |
| GET | `/v1/bookings/:id` | owner/partner/op | booking + events + `allowedTargets` |
| POST | `/v1/bookings/:id/transitions` | role-checked | `{to, actor, reason?}`; server-side state machine; operator reason audited |
| POST | `/v1/dispatch/offers` | operator/system | eligibility+ranking+batch offers with TTL |
| POST | `/v1/offers/:id/accept` | partner | first-valid-wins atomic lock; losers → `expired` |
| POST | `/v1/payments/authorize` | customer | provider token only (`tok_…`); inside auth window |
| POST | `/v1/payments/capture` | system | only from `completed`; writes `charge`+`partner_payable` ledger; → `payment_captured` |
| POST | `/v1/payments/refund` | operator | `{reason, approvedBy}` required; → `refunded` |
| POST | `/v1/webhooks/payments` | provider sig | `x-provider-signature` verified; dedupe by provider event id; persist-before-process |
| GET | `/v1/metrics/pilot` | operator | fulfilment/ledger/outbox + targets |

Error shape: `{ code, message }` — codes: `INVALID_QUOTE`, `QUOTE_EXPIRED`, `ILLEGAL_TRANSITION`, `OFFER_REJECTED`, `AUTH_FAILED`, `CAPTURE_FAILED`, `REFUND_FAILED`, `BAD_SIGNATURE`, `NOT_FOUND`.

Idempotency: `idempotencyKey` on booking create/capture/refund; replay returns original result, no duplicate money/work.
