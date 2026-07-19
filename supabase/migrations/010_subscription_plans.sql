-- Migration: Admin-configurable subscription plans
-- ═══════════════════════════════════════════════════════════════════════════════

-- Move plan definitions from hardcoded application code into an admin-managed table.
-- Plans are served to users via the API; admins can edit pricing, features, and status
-- without needing code deployments.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,                         -- free | pro | enterprise (or custom slugs)
  name TEXT NOT NULL,                                -- Display name shown to users
  description TEXT,                                  -- Short plan description
  tier INTEGER NOT NULL DEFAULT 0,                   -- Hierarchy level (0=free, 1=pro, 2=enterprise, etc.)
  is_active BOOLEAN NOT NULL DEFAULT true,           -- Whether this plan is available for new signups
  is_default BOOLEAN NOT NULL DEFAULT false,         -- Default plan for new users (only one should be true)

  -- Pricing (in smallest currency unit: cents, kobo, pesewas, etc.)
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',              -- ISO 4217

  -- Trial
  trial_days INTEGER NOT NULL DEFAULT 0,             -- 0 = no trial

  -- Features (JSON array of strings shown in the pricing UI)
  features JSONB NOT NULL DEFAULT '[]',

  -- Limits (enforceable quotas — nullable means "unlimited")
  limits JSONB NOT NULL DEFAULT '{}',                -- e.g., {"lessons_per_month": 5, "focus_sessions": 3}

  -- Styling / UI hints
  badge_text TEXT,                                    -- e.g., "Most Popular", "Best Value"
  highlight BOOLEAN NOT NULL DEFAULT false,           -- Highlight this plan in the pricing grid

  -- Sorting
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_default
  ON subscription_plans(is_default) WHERE is_default = true;

-- Fast lookup by slug
CREATE INDEX IF NOT EXISTS idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, sort_order);

-- RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can read active plans (pricing page, user app)
CREATE POLICY "Anyone can read active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- Only service role can mutate (admin API)
CREATE POLICY "Service role manages plans" ON subscription_plans
  FOR ALL USING (auth.role() = 'service_role');


-- ── Seed with existing plan data (matches current PLANS constant) ───────────

INSERT INTO subscription_plans (slug, name, description, tier, is_active, is_default, price_monthly, price_yearly, currency, trial_days, features, limits, sort_order)
VALUES
  (
    'free',
    'Free',
    'Get started with the basics',
    0,
    true,
    true,
    0,
    0,
    'USD',
    0,
    '["5 lessons per month", "Basic focus timer", "Community events access"]',
    '{"lessons_per_month": 5}',
    0
  ),
  (
    'pro',
    'Pro',
    'For serious learners who want more',
    1,
    true,
    false,
    999,
    9990,
    'USD',
    7,
    '["Unlimited lessons", "Advanced focus sessions with stats", "Priority event registration", "Quiz attempts history", "AI learning insights"]',
    '{}',
    1
  ),
  (
    'enterprise',
    'Enterprise',
    'For teams and organizations',
    2,
    true,
    false,
    4999,
    49990,
    'USD',
    14,
    '["Everything in Pro", "Team management", "Custom learning paths", "Dedicated support", "API access"]',
    '{}',
    2
  )
ON CONFLICT (slug) DO NOTHING;
