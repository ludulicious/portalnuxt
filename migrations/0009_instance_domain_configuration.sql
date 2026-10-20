ALTER TABLE platform_instance ADD COLUMN domain_configuration_pending boolean NOT NULL DEFAULT false;

-- Hostnames are case-insensitive, including any existing instance domains.
CREATE UNIQUE INDEX platform_instance_domain_lower_idx ON platform_instance (lower(domain));
