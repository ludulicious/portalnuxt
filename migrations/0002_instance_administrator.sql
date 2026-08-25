ALTER TABLE platform_instance ADD COLUMN IF NOT EXISTS admin_email text;
UPDATE platform_instance SET admin_email = owner_email WHERE admin_email IS NULL;
ALTER TABLE platform_instance ALTER COLUMN admin_email SET NOT NULL;
