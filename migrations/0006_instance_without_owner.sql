DROP INDEX IF EXISTS platform_instance_owner_user_id_idx;
ALTER TABLE platform_instance DROP COLUMN IF EXISTS owner_user_id;
ALTER TABLE platform_instance DROP COLUMN IF EXISTS owner_email;
