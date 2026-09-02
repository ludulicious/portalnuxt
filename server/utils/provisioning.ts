import { randomBytes, randomUUID } from 'node:crypto'
import type { PortalInstance, ProvisioningStep } from '../../shared/control-plane'

interface WorkRow {
  id: string
  provisioning_step: ProvisioningStep
}
export const sanitizeProvisioningError = (error: unknown) =>
  error instanceof Error
    ? error.message
        .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .slice(0, 500)
    : 'Provisioning failed'
class HealthCheckPendingError extends Error {}

async function claimWork(): Promise<WorkRow | null> {
  const result = await useDatabase().query<WorkRow>(`WITH candidate AS (
    SELECT id FROM platform_instance WHERE status IN ('QUEUED','PROVISIONING') AND next_attempt_at <= now() AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE platform_instance p SET locked_at = now(), status = 'PROVISIONING', sanitized_error = NULL, updated_at = now() FROM candidate WHERE p.id = candidate.id RETURNING p.id, p.provisioning_step`)
  return result.rows[0] || null
}

async function environmentFor(
  instance: PortalInstance & { encryptedDatabaseUrl: string; encryptedAuthSecret: string }
) {
  const config = useRuntimeConfig()
  if (!config.resendApiKey || !config.resendFromEmail) {
    throw new Error('Portal email delivery is not configured')
  }
  return {
    DATABASE_URL: decryptSecret(instance.encryptedDatabaseUrl),
    BETTER_AUTH_SECRET: decryptSecret(instance.encryptedAuthSecret),
    PUBLIC_URL: `https://${instance.domain}`,
    BETTER_AUTH_URL: `https://${instance.domain}`,
    ADMIN_EMAILS: instance.adminEmail,
    PORTAL_PROVIDER_NAME: instance.name,
    PORTAL_PROVIDER_SLUG: instance.slug,
    RESEND_API_KEY: config.resendApiKey as string,
    RESEND_FROM_EMAIL: config.resendFromEmail as string,
    PORTAL_REGISTRATION_MODE: 'open',
    PORTAL_GITHUB_ENABLED: 'false',
    PORTAL_GOOGLE_ENABLED: 'false',
    NODE_ENV: 'production'
  }
}

async function advance(instanceId: string, step: ProvisioningStep) {
  const pool = useDatabase()
  const instance = await findInstance(instanceId)
  if (!instance) {
    return
  }
  if (step === 'DATABASE') {
    const resource = await databaseProvider().ensure({ instanceId, slug: instance.slug })
    await databaseProvider().validate(resource.databaseUrl)
    await pool.query(
      `UPDATE platform_instance SET database_name=$2, database_role=$3, encrypted_database_url=$4, provisioning_step='SECRETS', locked_at=NULL, updated_at=now() WHERE id=$1`,
      [instanceId, resource.databaseName, resource.roleName, encryptSecret(resource.databaseUrl)]
    )
  } else if (step === 'SECRETS') {
    await pool.query(
      `UPDATE platform_instance SET encrypted_auth_secret=$2, provisioning_step='APPLICATION', locked_at=NULL, updated_at=now() WHERE id=$1`,
      [instanceId, encryptSecret(randomBytes(48).toString('base64url'))]
    )
  } else if (step === 'APPLICATION') {
    const uuid = await deploymentProvider().ensureApplication({
      instanceId,
      slug: instance.slug,
      name: instance.name,
      domain: instance.domain,
      image: instance.desiredImage,
      applicationUuid: instance.coolifyApplicationUuid
    })
    await pool.query(
      `UPDATE platform_instance SET coolify_application_uuid=$2, provisioning_step='ENVIRONMENT', locked_at=NULL, updated_at=now() WHERE id=$1`,
      [instanceId, uuid]
    )
  } else if (step === 'ENVIRONMENT') {
    const secrets = await pool.query<{ encrypted_database_url: string; encrypted_auth_secret: string }>(
      'SELECT encrypted_database_url, encrypted_auth_secret FROM platform_instance WHERE id=$1',
      [instanceId]
    )
    const row = secrets.rows[0]
    if (!row || !instance.coolifyApplicationUuid) {
      throw new Error('Provisioning resources are incomplete')
    }
    await deploymentProvider().configure(
      instance.coolifyApplicationUuid,
      await environmentFor(
        Object.assign(instance, {
          encryptedDatabaseUrl: row.encrypted_database_url,
          encryptedAuthSecret: row.encrypted_auth_secret
        })
      )
    )
    await pool.query(
      `UPDATE platform_instance SET provisioning_step='DEPLOYMENT', locked_at=NULL, updated_at=now() WHERE id=$1`,
      [instanceId]
    )
  } else if (step === 'DEPLOYMENT') {
    if (!instance.coolifyApplicationUuid) {
      throw new Error('Coolify application is missing')
    }
    const applicationUuid = await deploymentProvider().ensureApplication({
      instanceId,
      slug: instance.slug,
      name: instance.name,
      domain: instance.domain,
      image: instance.desiredImage,
      applicationUuid: instance.coolifyApplicationUuid
    })
    if (applicationUuid !== instance.coolifyApplicationUuid) {
      await pool.query(`UPDATE platform_instance SET coolify_application_uuid=$2, updated_at=now() WHERE id=$1`, [
        instanceId,
        applicationUuid
      ])
    }
    if (!instance.coolifyDeploymentUuid) {
      const uuid = await deploymentProvider().deploy(applicationUuid)
      await pool.query(
        `UPDATE platform_instance SET coolify_deployment_uuid=$2, locked_at=NULL, next_attempt_at=now()+interval '10 seconds', updated_at=now() WHERE id=$1`,
        [instanceId, uuid]
      )
      return
    }
    const status = await deploymentProvider().deploymentStatus(instance.coolifyDeploymentUuid)
    if (status === 'failed') {
      throw new Error('Portal deployment failed')
    }
    if (status !== 'finished') {
      await pool.query(
        `UPDATE platform_instance SET locked_at=NULL, next_attempt_at=now()+interval '10 seconds' WHERE id=$1`,
        [instanceId]
      )
      return
    }
    await pool.query(
      `UPDATE platform_instance SET provisioning_step='HEALTH', health_check_started_at=now(), locked_at=NULL, next_attempt_at=now(), updated_at=now() WHERE id=$1`,
      [instanceId]
    )
  } else if (step === 'HEALTH') {
    try {
      const health = await fetch(`https://${instance.domain}/api/health`, { signal: AbortSignal.timeout(8000) })
      if (!health.ok) {
        throw new HealthCheckPendingError(`Portal health check returned HTTP ${health.status}`)
      }
    } catch (error) {
      if (error instanceof HealthCheckPendingError) {
        throw error
      }
      throw new HealthCheckPendingError('Portal is not reachable yet')
    }
    await pool.query(
      `UPDATE platform_instance SET status='ACTIVE', provisioning_step='COMPLETE', deployed_image=desired_image, deployed_version=desired_version, locked_at=NULL, updated_at=now() WHERE id=$1`,
      [instanceId]
    )
    const request = await pool.query(
      `UPDATE access_request SET status='PROVISIONED',updated_at=now() WHERE instance_id=$1 AND status='PROVISIONING' RETURNING *`,
      [instanceId]
    )
    if (request.rows[0]) {
      const row = request.rows[0]
      await queueNotification(pool, `${row.id}:provisioned`, 'access-request.provisioned', row.email, {
        name: row.name,
        organization: row.organization,
        email: instance.adminEmail,
        url: `https://${instance.domain}`
      })
    }
  } else {
    await pool.query(`UPDATE platform_instance SET status='ACTIVE', locked_at=NULL WHERE id=$1`, [instanceId])
  }
}

export async function processProvisioningWork() {
  const work = await claimWork()
  if (!work) {
    return false
  }
  const attemptId = randomUUID()
  await useDatabase().query(
    `INSERT INTO provisioning_attempt (id,instance_id,step,state) VALUES ($1,$2,$3,'STARTED')`,
    [attemptId, work.id, work.provisioning_step]
  )
  try {
    await advance(work.id, work.provisioning_step)
    await useDatabase().query(`UPDATE provisioning_attempt SET state='SUCCEEDED',finished_at=now() WHERE id=$1`, [
      attemptId
    ])
  } catch (error) {
    const message = sanitizeProvisioningError(error)
    await useDatabase().query(
      `UPDATE provisioning_attempt SET state='FAILED',sanitized_error=$2,finished_at=now() WHERE id=$1`,
      [attemptId, message]
    )
    if (error instanceof HealthCheckPendingError) {
      const waiting = await useDatabase().query(
        `UPDATE platform_instance SET status='PROVISIONING',sanitized_error=NULL,locked_at=NULL,next_attempt_at=now()+interval '10 seconds',updated_at=now() WHERE id=$1 AND health_check_started_at > now()-interval '10 minutes' RETURNING id`,
        [work.id]
      )
      if (waiting.rowCount) {
        return true
      }
      await useDatabase().query(
        `UPDATE platform_instance SET status='ERROR',sanitized_error='Portal did not become healthy within 10 minutes',retry_count=retry_count+1,locked_at=NULL,updated_at=now() WHERE id=$1`,
        [work.id]
      )
      return true
    }
    await useDatabase().query(
      `UPDATE platform_instance SET status='ERROR',sanitized_error=$2,retry_count=retry_count+1,locked_at=NULL,next_attempt_at=now()+(least(retry_count+1,6)*interval '1 minute'),updated_at=now() WHERE id=$1`,
      [work.id, message]
    )
  }
  return true
}
