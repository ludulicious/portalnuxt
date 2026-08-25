import { randomUUID } from 'node:crypto'
import type { AccessRequest } from '../../shared/access-requests'

export function mapAccessRequest(row: Record<string, unknown>): AccessRequest {
  return {
    id: String(row.id),
    status: row.status as AccessRequest['status'],
    name: String(row.name),
    email: String(row.email),
    organization: String(row.organization),
    website: (row.website as string | null) || null,
    intendedUse: String(row.intended_use),
    expectedUsers: String(row.expected_users),
    desiredTimeline: String(row.desired_timeline),
    notes: (row.notes as string | null) || null,
    preferredSlug: (row.preferred_slug as string | null) || null,
    operatorNotes: (row.operator_notes as string | null) || null,
    declineReason: (row.decline_reason as string | null) || null,
    reviewerUserId: (row.reviewer_user_id as string | null) || null,
    instanceId: (row.instance_id as string | null) || null,
    termsAcceptedAt: row.terms_accepted_at ? new Date(String(row.terms_accepted_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }
}

export async function queueNotification(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  eventKey: string,
  kind: string,
  recipient: string,
  payload: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO notification_outbox (id,event_key,kind,recipient,payload)
     VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (event_key) DO NOTHING`,
    [randomUUID(), eventKey, kind, recipient.toLowerCase(), JSON.stringify(payload)]
  )
}

export function adminNotificationRecipients() {
  const config = useRuntimeConfig()
  return String(config.accessRequestNotificationEmails || config.operatorEmails || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}
