CREATE TABLE IF NOT EXISTS "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, "emailVerified" boolean NOT NULL DEFAULT false, image text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_instance (
  id text PRIMARY KEY, owner_user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE RESTRICT, owner_email text NOT NULL, name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'), domain text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING_EMAIL','QUEUED','PROVISIONING','ACTIVE','ERROR','SUSPENDED','DELETION_SCHEDULED')),
  provisioning_step text NOT NULL CHECK (provisioning_step IN ('DATABASE','SECRETS','APPLICATION','ENVIRONMENT','DEPLOYMENT','HEALTH','COMPLETE')),
  desired_image text NOT NULL, deployed_image text, database_name text, database_role text, encrypted_database_url text, encrypted_auth_secret text,
  coolify_application_uuid text UNIQUE, coolify_deployment_uuid text, sanitized_error text, retry_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS provisioning_attempt (id text PRIMARY KEY, instance_id text NOT NULL REFERENCES platform_instance(id) ON DELETE CASCADE, step text NOT NULL, state text NOT NULL CHECK (state IN ('STARTED','SUCCEEDED','FAILED')), sanitized_error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE TABLE IF NOT EXISTS audit_event (id text PRIMARY KEY, instance_id text REFERENCES platform_instance(id) ON DELETE SET NULL, actor_user_id text NOT NULL, action text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS allocation_limit (id text PRIMARY KEY, user_id text NOT NULL, network_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS allocation_limit_network_idx ON allocation_limit (network_hash, created_at);
CREATE INDEX IF NOT EXISTS platform_instance_queue_idx ON platform_instance (next_attempt_at, created_at) WHERE status IN ('QUEUED', 'PROVISIONING', 'ERROR');
