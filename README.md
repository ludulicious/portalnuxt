# Customer Portal SaaS control plane

Independent control plane for provisioning ordinary, dedicated Customer Portal
instances. This repository must not import Customer Portal runtime packages.

## Local setup

1. Copy `.env.example` to `.env` and configure PostgreSQL and Better Auth.
2. Run `pnpm install` and `pnpm migrate`.
3. Run `pnpm dev`.

Coolify and PostgreSQL administrator credentials are server-only. Provisioning
is resumable and records external resource identifiers before advancing.

## Architecture

- Platform authentication and sessions are local to this application.
- One verified account can own one instance in v1.
- Each instance has a separate database role, database, auth secret, domain, and
  immutable Customer Portal image reference.
- `PORTAL_IMAGE` must point at the untagged GHCR repository published from
  `apps/saas-portal/Dockerfile`. The control plane resolves its release tags to
  immutable digests; it no longer provisions the `demo-apex` image.
- `POSTGRES_ADMIN_URL` is used by the control plane for database administration.
  Optional `POSTGRES_RUNTIME_URL` is the private endpoint injected into portal
  containers. Explicit retries rotate the tenant password and refresh this URL.
- A background worker claims queued attempts and advances one idempotent
  provisioning step at a time.
- The platform never receives portal sessions or business data.

After provisioning, the configured administrator email is passed through the
existing `ADMIN_EMAILS` contract. The administrator signs up in the new portal
and completes portal-local onboarding; branding, modules, themes, and content
never enter the control-plane database.
