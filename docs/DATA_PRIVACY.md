# Data & privacy plan (Plan §04)

- Truth: relational rows; history: append-only `booking_events` + `admin_audit`. Images in private object storage with `job_evidence` refs (type/uploader/capture-time/upload-status/key/checksum/policy/retention) — never DB blobs.
- Money: `ledger_entries` immutable, `idempotency_key` unique; amounts minor units + currency; `payout_batches` + provider reconciliation items.
- Time: UTC stored, local tz rendered. Server-side state machine; clients can't jump or reprice.
- Outbox: DB commit + event insert atomic (`outbox` table); worker delivers notifications/image-processing/webhooks/payouts with retries + DLQ visibility.
- Retention: evidence `retention_until`; deletion requests, legal holds, access logs documented. Don't claim immutability unless storage+policy enforces it.
- Identity docs separated from general support access. Location: timestamp+accuracy+shift-status, reject stale/out-of-order, minimal retention, on-shift only with visible off-duty state.
