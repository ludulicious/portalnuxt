import { ACCESS_REQUEST_STATUSES, type AccessRequestListResponse } from '../../../../shared/access-requests'

export default defineEventHandler(async (event): Promise<AccessRequestListResponse> => {
  await requireOperator(event)
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1),
    pageSize = 20
  const search = String(query.search || '').trim(),
    status = String(query.status || '')
  const sortMap = {
    createdAt: 'created_at',
    organization: 'organization',
    status: 'status',
    updatedAt: 'updated_at'
  } as const
  const sort = sortMap[String(query.sort || '') as keyof typeof sortMap] || 'created_at'
  const direction = query.direction === 'asc' ? 'ASC' : 'DESC'
  const values: unknown[] = [],
    where: string[] = []
  if (search) {
    values.push(`%${search}%`)
    where.push(
      `(name ILIKE $${values.length} OR email ILIKE $${values.length} OR organization ILIKE $${values.length} OR intended_use ILIKE $${values.length})`
    )
  }
  if (ACCESS_REQUEST_STATUSES.includes(status as never)) {
    values.push(status)
    where.push(`status=$${values.length}`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const count = await useDatabase().query<{ count: string }>(
    `SELECT count(*)::text count FROM access_request ${clause}`,
    values
  )
  values.push(pageSize, (page - 1) * pageSize)
  const result = await useDatabase().query(
    `SELECT * FROM access_request ${clause} ORDER BY ${sort} ${direction},id ${direction} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  )
  const totalItems = Number(count.rows[0]?.count || 0),
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  return {
    items: result.rows.map(mapAccessRequest),
    pagination: { page, pageSize, totalItems, totalPages, hasNext: page < totalPages }
  }
})
