-- Password Reset OTPs table
-- Stores hashed OTPs for secure password reset flow

CREATE TABLE IF NOT EXISTS password_reset_otps (
  email TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup of expired OTPs
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires_at 
ON password_reset_otps(expires_at);

-- Auto-cleanup expired OTPs (optional - run via cron or scheduled function)
-- DELETE FROM password_reset_otps WHERE expires_at < NOW() - INTERVAL '1 hour';

-- RLS policies
ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (no user access)
CREATE POLICY "Service role only" ON password_reset_otps
  FOR ALL
  USING (auth.role() = 'service_role');
