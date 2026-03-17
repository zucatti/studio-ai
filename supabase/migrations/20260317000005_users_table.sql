-- Users table for access control
-- Links Auth0 users to app-level permissions

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  picture TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by auth0_id
CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users(auth0_id);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active) WHERE active = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own record
CREATE POLICY "Users can read own record"
  ON users FOR SELECT
  USING (auth0_id = current_setting('app.current_user_id', true));

-- Only service role can insert/update/delete
CREATE POLICY "Service role full access"
  ON users FOR ALL
  USING (current_setting('role', true) = 'service_role');

-- Comment
COMMENT ON TABLE users IS 'Application users with access control';
COMMENT ON COLUMN users.auth0_id IS 'Auth0 user ID (sub claim)';
COMMENT ON COLUMN users.active IS 'Whether user is allowed to access the application';
