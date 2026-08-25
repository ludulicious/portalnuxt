import { accessRequestTransitionSchema } from '../../../../shared/access-requests'

const transitions = {
  'start-review': ['NEW', 'REVIEWING'],
  approve: ['NEW', 'REVIEWING'],
  decline: ['NEW', 'REVIEWING', 'APPROVED'],
  'save-notes': ['NEW', 'REVIEWING', 'APPROVED', 'DECLINED']
} as const
export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const id = getRouterParam(event, 'id')!
  const input = accessRequestTransitionSchema.parse(await readBody(event))
  const client = await useDatabase().connect()
  try {
    await client.query('BEGIN')
    const current = await client.query('SELECT * FROM access_request WHERE id=$1 FOR UPDATE', [id])
    const row = current.rows[0]
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Access request not found' })
    }
    if (!(transitions[input.action] as readonly string[]).includes(row.status)) {
      throw createError({ statusCode: 409, statusMessage: 'This action is no longer available' })
    }
    const status =
      input.action === 'start-review'
        ? 'REVIEWING'
        : input.action === 'approve'
          ? 'APPROVED'
          : input.action === 'decline'
            ? 'DECLINED'
            : row.status
    const updated = await client.query(
      `UPDATE access_request SET status=$2,operator_notes=COALESCE($3,operator_notes),decline_reason=CASE WHEN $2='DECLINED' THEN $4 ELSE decline_reason END,reviewer_user_id=$5,reviewed_at=CASE WHEN $2<>'NEW' THEN now() ELSE reviewed_at END,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,declined_at=CASE WHEN $2='DECLINED' THEN now() ELSE declined_at END,updated_at=now() WHERE id=$1 RETURNING *`,
      [id, status, input.operatorNotes ?? null, input.declineReason ?? null, session.user.id]
    )
    if (input.action === 'approve') {
      await queueNotification(client, `${id}:approved`, 'access-request.approved', row.email, {
        name: row.name,
        organization: row.organization
      })
    }
    if (input.action === 'decline') {
      await queueNotification(client, `${id}:declined`, 'access-request.declined', row.email, {
        name: row.name,
        organization: row.organization,
        reason: input.declineReason || ''
      })
    }
    await client.query('COMMIT')
    return mapAccessRequest(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
