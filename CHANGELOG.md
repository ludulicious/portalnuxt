# Changelog

## Unreleased

- Operators can add optional runtime environment variables when creating instances, including from approved access requests. Values are validated, encrypted at rest, and applied before first startup and on initial provisioning retries. Existing deployments keep their environment settings.
- Instances created with both Customer Portal demo flags enabled receive a dedicated database ending in `_demo`.
- Fixed Nuxt type checking configuration and error logging when portal release refresh fails.
- Kept Vue compiler dependencies external during SSR bundling to avoid loading an incompatible `estree-walker` version in production.
