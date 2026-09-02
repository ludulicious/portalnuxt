import { createHash, randomUUID } from 'node:crypto'
import { accessRequestInputSchema } from '../../../shared/access-requests'

export default defineEventHandler(async (event) => {
  const input = accessRequestInputSchema.parse(await readBody(event))
  if (input.company) {
    return { accepted: true }
  }
  const id = randomUUID()
  console.info('Access request submission started', { requestId: id })
  const config = useRuntimeConfig()
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (config.turnstileSecretKey) {
    const form = new FormData()
    form.set('secret', String(config.turnstileSecretKey))
    form.set('response', input.turnstileToken)
    form.set('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    })
    const result = (await response.json()) as { success?: boolean }
    if (!result.success) {
      console.warn('Access request security verification failed', { requestId: id })
      throw createError({ statusCode: 400, statusMessage: 'Security verification failed' })
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 503, statusMessage: 'Request verification is not configured' })
  }
  const pool = useDatabase()
  const networkHash = createHash('sha256').update(ip).digest('hex')
  const limited = await pool.query<{ count: string }>(
    `SELECT count(*)::text count FROM audit_event WHERE action='access-request.submitted' AND metadata->>'networkHash'=$1 AND created_at>now()-interval '1 hour'`,
    [networkHash]
  )
  if (Number(limited.rows[0]?.count || 0) >= 5) {
    console.warn('Access request rate limit exceeded', { requestId: id })
    throw createError({ statusCode: 429, statusMessage: 'Too many requests. Try again later.' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO access_request
      (id,name,email,organization,website,intended_use,expected_users,desired_timeline,notes,preferred_slug,terms_accepted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT DO NOTHING RETURNING id`,
      [
        id,
        input.name,
        input.email,
        input.organization,
        input.website || null,
        input.intendedUse,
        input.expectedUsers,
        input.desiredTimeline,
        input.notes || null,
        input.preferredSlug || null
      ]
    )
    if (inserted.rowCount) {
      await queueNotification(client, `${id}:received`, 'access-request.received', input.email, {
        name: input.name,
        organization: input.organization
      })
      for (const recipient of adminNotificationRecipients()) {
        await queueNotification(client, `${id}:admin:${recipient}`, 'access-request.admin', recipient, {
          name: input.name,
          email: input.email,
          organization: input.organization,
          url: `${config.public.platformUrl}/access-requests/${id}`
        })
      }
      await client.query(
        `INSERT INTO audit_event (id,actor_user_id,action,metadata) VALUES ($1,'public','access-request.submitted',$2::jsonb)`,
        [randomUUID(), JSON.stringify({ requestId: id, networkHash })]
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Access request persistence failed', { requestId: id })
    throw error
  } finally {
    client.release()
  }
  console.info('Access request submission accepted', { requestId: id })
  return { accepted: true }
})
