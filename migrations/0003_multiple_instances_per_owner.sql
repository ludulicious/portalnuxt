ALTER TABLE platform_instance
  DROP CONSTRAINT IF EXISTS platform_instance_owner_user_id_key;

CREATE INDEX IF NOT EXISTS platform_instance_owner_user_id_idx
  ON platform_instance (owner_user_id, created_at DESC);
