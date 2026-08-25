ALTER TABLE platform_instance
  ADD COLUMN IF NOT EXISTS health_check_started_at timestamptz;
