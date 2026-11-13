ALTER TABLE platform_instance
  ADD COLUMN IF NOT EXISTS encrypted_environment_variables text;
