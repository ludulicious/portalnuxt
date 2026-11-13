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

## Extra instance environment variables

Both **Provision a new instance** and **Create instance** on an approved access
request offer **Add variable**. Supply a name and a literal value for each extra
runtime variable. Empty and multiline values are supported; do not add shell
quotes or `export`. Names must use letters, numbers, and underscores and cannot
start with a number. Duplicate names and platform-managed variables (database,
domain, auth secrets, provider identity, email, and the generated defaults) are
rejected, including their `NUXT_` aliases. Up to 50 variables are accepted, with
16,384 characters per value and 131,072 characters in total.

Run `pnpm migrate` when upgrading the control plane to add the encrypted storage
column. Extra values use `CONTROL_PLANE_ENCRYPTION_KEY`, like the other instance
secrets. They are not returned through instance APIs or included in audit
metadata. Keep this key stable across restarts. Variables are sent to Coolify
before the first deployment and reused if initial provisioning is retried.
Redeploying or updating an already deployed instance preserves its Coolify
environment. Change existing runtime settings directly in Coolify.

### Creating a demo instance

Use a separate instance, domain, and deployment with Customer Portal v0.13.0 or
later. Before provisioning, add both variables:

```dotenv
NUXT_PORTAL_DEMO_ENABLED=true
NUXT_PUBLIC_PORTAL_DEMO_ENABLED=true
```

PortalNuxt automatically gives this instance a dedicated database named
`portal-<slug>_demo` (long names are shortened with a hash). Its database role
retains the usual `portal-<slug>` name. The same database is reused on retries.
The portal image migrates the empty database and seeds demo identities and
sample data on first startup. Visitors can switch identities and try workflows;
demo settings remain read-only and sample data resets daily.

Set both flags together, with the literal value `true`. Do this during creation:
turning on demo mode later for an ordinary instance will fail its database-name
and empty-database safety checks. Demo data is disposable; keep real customer
data in separate ordinary instances.

## Custom instance domains

Operators can select **Change domain** from an instance's actions menu. Enter a
hostname such as `portal.example.com` without a scheme or path. The new-instance
form also accepts an optional custom domain; leaving it blank uses the default
`<slug>.<PORTAL_BASE_DOMAIN>` address. Point its DNS at
the instance server first: use a CNAME to the default instance hostname for a
subdomain, or the server's A/AAAA records for an apex domain. Configure HTTPS on
the Coolify proxy as for the default instance domains.

Saving queues a redeployment, updates the Coolify domain and the portal's
`PUBLIC_URL` and `BETTER_AUTH_URL`, then checks HTTPS health at the new address.
The new domain replaces the previous address; users should sign in again at
the new URL. Other runtime settings on an existing portal are preserved.
Domains must be unique across instances. Another instance's default address is
reserved even when that instance uses a custom domain. The same form can restore
the instance's default domain. Domain changes are audited and are available when
an instance is active or provisioning has failed.
