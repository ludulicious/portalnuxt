interface OutboxRow {
  id: string
  kind: string
  recipient: string
  payload: Record<string, string>
  attempts: number
}

function emailFor(row: OutboxRow) {
  const p = row.payload
  const name = escapeEmailHtml(p.name)
  const organization = escapeEmailHtml(p.organization)
  if (row.kind === 'access-request.received') {
    return {
      subject: 'We received your PortalNuxt request',
      html: renderPortalEmail(
        `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0 0 18px">We received your request for <strong>${organization}</strong>. Our team reviews every request manually and will contact you by email.</p><p style="margin:0">No account has been created.</p>`
      )
    }
  }
  if (row.kind === 'access-request.admin') {
    return {
      subject: `New PortalNuxt request · ${p.organization}`,
      html: renderPortalEmail(
        `<p style="margin:0">${name} (${escapeEmailHtml(p.email)}) requested a managed portal for <strong>${organization}</strong>.</p>${portalEmailButton('Review request', p.url)}`
      )
    }
  }
  if (row.kind === 'access-request.approved') {
    return {
      subject: 'Your PortalNuxt request was approved',
      html: renderPortalEmail(
        `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0">Your request for <strong>${organization}</strong> was approved. We will email you again when your dedicated portal is ready.</p>`
      )
    }
  }
  if (row.kind === 'access-request.declined') {
    return {
      subject: 'An update on your PortalNuxt request',
      html: renderPortalEmail(
        `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0${p.reason ? ' 0 18px' : ''}">We are unable to offer a managed portal for <strong>${organization}</strong> at this time.</p>${p.reason ? `<p style="margin:0">${escapeEmailHtml(p.reason)}</p>` : ''}`
      )
    }
  }
  return {
    subject: 'Your PortalNuxt portal is ready',
    html: renderPortalEmail(
      `<p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0">Your dedicated portal is ready.</p>${portalEmailButton('Open your portal', p.url)}<p style="margin:0">Create your administrator account using <strong>${escapeEmailHtml(p.email)}</strong>.</p>`
    )
  }
}

export async function processNotificationOutbox() {
  const pool = useDatabase()
  const claimed = await pool.query<OutboxRow>(`WITH candidate AS (
    SELECT id FROM notification_outbox WHERE sent_at IS NULL AND next_attempt_at <= now()
      AND (locked_at IS NULL OR locked_at < now()-interval '10 minutes')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE notification_outbox n SET locked_at=now() FROM candidate WHERE n.id=candidate.id
    RETURNING n.id,n.kind,n.recipient,n.payload,n.attempts`)
  const row = claimed.rows[0]
  if (!row) {
    return false
  }
  const config = useRuntimeConfig()
  try {
    if (!config.resendApiKey || !config.resendFromEmail) {
      throw new Error('Resend is not configured')
    }
    const email = emailFor(row)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': row.id
      },
      body: JSON.stringify({ from: config.resendFromEmail, to: row.recipient, ...email })
    })
    if (!response.ok) {
      throw new Error(`Resend returned HTTP ${response.status}`)
    }
    await pool.query(`UPDATE notification_outbox SET sent_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1`, [
      row.id
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed'
    await pool.query(
      `UPDATE notification_outbox SET attempts=attempts+1,locked_at=NULL,last_error=$2,next_attempt_at=now()+(least(attempts+1,6)*interval '5 minutes') WHERE id=$1`,
      [row.id, message]
    )
  }
  return true
}
