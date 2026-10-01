# Car Wash Platform — Foundation Build (Implementation Plan v2.0)

Executes **Implementation Plan v2.0 §01–§08, Phase 1 Foundation** (weeks 1–4 exit): customer+partner flows, lean ops console, modular backend, zone/dispatch/pricing/ledger core, data/privacy plan, provider seams, pipeline, playbook draft.

Source of truth: `Car Wash Platform - Improved Implementation Plan.pdf`.

## Layout
- `backend/` — TS modular monolith (identity/catalog/quotes/booking/dispatch/partner/ledger/notify/support). `npm run build && npm test`.
- `db/migrations/001_init.sql` — Postgres+PostGIS schema (truth + events + outbox + ledger + evidence refs).
- `web-ops/` — React ops console (approvals, zones, exceptions, manual assign, refunds).
- `mobile/` — Flutter spec + device-spike gate.
- `docs/` — ARCHITECTURE, API_CONTRACT, DECISIONS, DATA_PRIVACY, OPERATIONS_PLAYBOOK, UNIT_ECONOMICS, PILOT_CHECKLIST.
- `infra/docker-compose.yml` — db + redis + backend.
- `scripts/demo.sh` — end-to-end happy path via curl.

## Quickstart
```bash
# backend
cd backend && npm install && npm run build && npm test
PORT=4000 NODE_ENV=test node dist/app.js &  # or npm run dev
# ops console
cd ../web-ops && npm install && npm run dev
# full stack
docker compose -f infra/docker-compose.yml up --build
```

## Demo (backend on :4000)
```bash
bash scripts/demo.sh
```

## Pilot gates
See `docs/PILOT_CHECKLIST.md` + `docs/UNIT_ECONOMICS.md`. Expand one zone at a time only after fulfilment/on-time/quality/margin hold 2 weeks with zero unresolved high-severity incidents.
