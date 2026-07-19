-- Migration: Payment transactions with idempotency protection & admin-configurable provider settings
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════

-- ── Payment Transactions ────────────────────────────────────────────────────────
-- Records every payment attempt. The idempotency_key column prevents double-charges:
-- if the same key is submitted twice, the second insert is rejected by the unique constraint.

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,                    -- client-generated unique key per payment attempt
  provider TEXT NOT NULL,                            -- paddle | paystack | flutterwave
  provider_reference TEXT,                           -- provider's transaction/reference ID
  amount INTEGER NOT NULL,                           -- smallest currency unit (cents, kobo, pesewas)
  currency TEXT NOT NULL DEFAULT 'USD',              -- ISO 4217
  status TEXT NOT NULL DEFAULT 'pending',            -- pending | processing | success | failed | refunded
  plan TEXT,                                         -- free | pro | enterprise (nullable for one-off payments)
  billing_interval TEXT,                             -- monthly | yearly
  failure_reason TEXT,                               -- populated on failure
  failover_from TEXT,                                -- if this was a failover, which provider failed
  metadata JSONB DEFAULT '{}',                       -- provider-specific extras, webhook payloads, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: reject duplicate payment attempts with the same key
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_idempotency
  ON payment_transactions(idempotency_key);

-- Fast lookups by user and status
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_ref ON payment_transactions(provider, provider_reference);

-- RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own transactions" ON payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages transactions" ON payment_transactions
  FOR ALL USING (auth.role() = 'service_role');


-- ── Payment Provider Configuration ──────────────────────────────────────────────
-- Admin-managed table: one row per provider. Controls which providers are active,
-- their API credentials (encrypted at rest via Supabase), and routing rules.

CREATE TABLE IF NOT EXISTS payment_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,                     -- paddle | paystack | flutterwave
  display_name TEXT NOT NULL,                        -- Human-friendly name for admin UI
  is_enabled BOOLEAN NOT NULL DEFAULT false,         -- admin can toggle providers on/off
  is_primary_local BOOLEAN NOT NULL DEFAULT false,   -- primary provider for local (African) payments
  is_failover_local BOOLEAN NOT NULL DEFAULT false,  -- failover provider for local payments
  is_international BOOLEAN NOT NULL DEFAULT false,   -- handles international payments

  -- Credentials (stored encrypted at rest by Supabase)
  public_key TEXT,                                   -- client-facing key (Paystack/Flutterwave)
  secret_key TEXT,                                   -- server-side secret key
  webhook_secret TEXT,                               -- webhook signature verification secret
  extra_config JSONB DEFAULT '{}',                   -- provider-specific config (e.g., Paddle seller_id, price_ids)

  -- Supported countries (JSON array of ISO 3166-1 alpha-2 codes)
  -- Empty array means "all countries" for that provider's scope
  supported_countries JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS — only service role (API server) can read credentials
ALTER TABLE payment_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages provider config" ON payment_provider_config
  FOR ALL USING (auth.role() = 'service_role');


-- ── Seed default provider rows (disabled, no credentials) ───────────────────────
INSERT INTO payment_provider_config (provider, display_name, is_international, is_primary_local, is_failover_local)
VALUES
  ('paddle', 'Paddle', true, false, false),
  ('paystack', 'Paystack', false, true, false),
  ('flutterwave', 'Flutterwave', false, false, true)
ON CONFLICT (provider) DO NOTHING;
