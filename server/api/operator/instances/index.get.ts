import { z } from 'zod'
import { INSTANCE_STATUSES } from '../../../../shared/control-plane'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).default(''),
  status: z.enum(INSTANCE_STATUSES).optional(),
  version: z.string().trim().max(100).optional(),
  sort: z.enum(['name', 'createdAt', 'status', 'version']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc')
})

const sortColumns = {
  name: 'name',
  createdAt: 'created_at',
  status: 'status',
  version: 'deployed_version'
} as const

export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const query = querySchema.parse(getQuery(event))
  const parameters: unknown[] = []
  const conditions: string[] = []

  if (query.search) {
    parameters.push(`%${query.search}%`)
    const value = `$${parameters.length}`
    conditions.push(
      `(name ILIKE ${value} OR slug ILIKE ${value} OR domain ILIKE ${value} OR admin_email ILIKE ${value})`
    )
  }
  if (query.status) {
    parameters.push(query.status)
    conditions.push(`status = $${parameters.length}`)
  }
  if (query.version) {
    parameters.push(query.version)
    conditions.push(`deployed_version = $${parameters.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const countResult = await useDatabase().query<{ total: string }>(
    `SELECT count(*)::text AS total FROM platform_instance ${where}`,
    parameters
  )
  const totalItems = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize))
  const page = Math.min(query.page, totalPages)
  const listParameters = [...parameters, query.pageSize, (page - 1) * query.pageSize]
  const sortColumn = sortColumns[query.sort]
  const direction = query.direction === 'asc' ? 'ASC' : 'DESC'
  const result = await useDatabase().query(
    `SELECT * FROM platform_instance ${where} ORDER BY ${sortColumn} ${direction} NULLS LAST, id ASC LIMIT $${listParameters.length - 1} OFFSET $${listParameters.length}`,
    listParameters
  )

  return {
    items: result.rows.map(mapInstance),
    pagination: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages
    }
  }
})
