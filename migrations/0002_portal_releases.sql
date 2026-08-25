CREATE TABLE IF NOT EXISTS portal_release (
  version text PRIMARY KEY,
  image_digest text NOT NULL UNIQUE CHECK (image_digest ~ '^ghcr\.io/.+@sha256:[a-f0-9]{64}$'),
  discovered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_instance ADD COLUMN IF NOT EXISTS desired_version text;
ALTER TABLE platform_instance ADD COLUMN IF NOT EXISTS deployed_version text;
CREATE INDEX IF NOT EXISTS portal_release_discovered_idx ON portal_release (discovered_at DESC);
