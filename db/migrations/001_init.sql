-- Car Wash Platform — 001_init.sql (Plan §04)
-- Postgres + PostGIS. Relational truth + append-only events. Amounts in minor units + currency. UTC timestamps.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Identity
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','partner','operator','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE partner_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','suspended','offboarded')),
  payout_account_ref TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  equipment_ok BOOLEAN NOT NULL DEFAULT FALSE,
  cert_expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supply & catalog
CREATE TABLE service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  boundary GEOMETRY(Polygon, 4326) NOT NULL,
  open_hours JSONB NOT NULL DEFAULT '{}',
  max_travel_min INT NOT NULL DEFAULT 30
);
CREATE INDEX ON service_zones USING GIST (boundary);
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, base_minor INT NOT NULL CHECK (base_minor >= 0),
  duration_min INT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  ruleset_version TEXT NOT NULL DEFAULT 'v1.0-pilot'
);
CREATE TABLE price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  vehicle_tier TEXT NOT NULL, amount_minor INT NOT NULL,
  ruleset_version TEXT NOT NULL, valid_from TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transaction: quotes, bookings, events, offers
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency CHAR(3) NOT NULL, lines JSONB NOT NULL, total_minor INT NOT NULL CHECK (total_minor > 0),
  ruleset_version TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  vehicle_id UUID NOT NULL, -- references vehicles(id) when fleet module lands
  zone_id UUID NOT NULL REFERENCES service_zones(id),
  service_type TEXT NOT NULL, quote_id UUID NOT NULL REFERENCES quotes(id),
  total_minor INT NOT NULL, currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  partner_id UUID REFERENCES users(id),
  scheduled_start TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, actor TEXT NOT NULL,
  reason TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON booking_events (booking_id, at);
CREATE TABLE dispatch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users(id),
  payout_estimate_minor INT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, partner_id)
);

-- Evidence (private object storage refs, never blobs)
CREATE TABLE job_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pre','post','damage','site')),
  uploader_id UUID NOT NULL REFERENCES users(id),
  captured_at TIMESTAMPTZ NOT NULL, object_key TEXT NOT NULL,
  checksum TEXT NOT NULL, upload_status TEXT NOT NULL DEFAULT 'pending',
  retention_until DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Money: immutable ledger + reconciliation
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL CHECK (kind IN ('charge','tax','platform_fee','partner_payable','promo','refund','payout','cancellation_fee')),
  amount_minor INT NOT NULL, currency CHAR(3) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_ref TEXT, approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES users(id),
  period_from DATE NOT NULL, period_to DATE NOT NULL,
  total_minor INT NOT NULL, currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', provider_ref TEXT
);

-- Outbox (transactional) for notifications/webhooks (Plan §02)
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL, payload JSONB NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT FALSE, attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support cases + audit
CREATE TABLE support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  opened_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, detail JSONB NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
