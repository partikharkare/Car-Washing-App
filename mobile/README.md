# Mobile apps — Flutter spec (Plan §02)

Flutter is the shared-code starting choice **iff** a short device spike proves, on supported phones:
- background location (only on-shift / active job, state-based intervals, visible off-duty state),
- camera uploads (guided pre/post evidence, lighting/angle/vehicle-identity checks),
- permissions + battery use.

Keep **customer** and **partner** experiences distinct (separate flavors/targets), one codebase.

## Must-prove spike (Phase 1 gate, weeks 1-4)
1. Location: `geolocator` + background mode; stop collection off-duty; reject stale/out-of-order updates server-side; show last-update time, never stale GPS as live.
2. Camera: guided capture flow (pre-wash condition → after-photos), upload to presigned private object-storage URLs, checksum + retry + upload-status tracking.
3. Push: provider integration; WebSocket for active trip + push/polling fallback on drops.
4. Release: store disclosures (precise location + photos), consent + notification preferences.

## Customer journey (Plan §01)
Choose (vehicle, service, pin + access notes, window, itemized total) → Confirm (terms, auth, arrival window only after assignment) → Complete (status, masked chat/call, pre-photos, evidence + report flow).

## Partner journey
Shift/radius/skills → time-limited offer (payout estimate, access notes) → accept/decline → navigate → arrived → booking-code confirm → guided evidence → checklist → after-photos → close → earnings.

## API surface used
`POST /v1/quotes`, `POST /v1/bookings`, `GET /v1/bookings/:id` (poll + WS later), `POST /v1/offers/:id/accept`, `POST /v1/payments/*`, `POST /v1/webhooks/payments` (backend only), partner location endpoint (authed, timestamp+accuracy+shift-status).

See `../docs/API_CONTRACT.md`.
