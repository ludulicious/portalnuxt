CREATE TABLE IF NOT EXISTS access_request (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','REVIEWING','APPROVED','DECLINED','PROVISIONING','PROVISIONED')),
  name text NOT NULL, email text NOT NULL, organization text NOT NULL, website text,
  intended_use text NOT NULL, expected_users text NOT NULL, desired_timeline text NOT NULL,
  notes text, preferred_slug text, operator_notes text, decline_reason text,
  reviewer_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  instance_id text UNIQUE REFERENCES platform_instance(id) ON DELETE SET NULL,
  reviewed_at timestamptz, approved_at timestamptz, declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_request_open_email_idx ON access_request (lower(email))
  WHERE status IN ('NEW','REVIEWING','APPROVED','PROVISIONING');
CREATE INDEX IF NOT EXISTS access_request_list_idx ON access_request (status, created_at DESC, id);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id text PRIMARY KEY, event_key text NOT NULL UNIQUE, kind text NOT NULL, recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
  sent_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_outbox_queue_idx ON notification_outbox (next_attempt_at, created_at)
  WHERE sent_at IS NULL;
