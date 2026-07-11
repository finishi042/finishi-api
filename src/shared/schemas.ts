import { z } from 'zod'

export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v || '1', 10)
      return Number.isFinite(n) && n >= 1 ? n : 1
    }),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = parseInt(v || '20', 10)
      return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 20
    }),
})

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

export function parsePagination(query: { page?: string; limit?: string }): {
  page: number
  limit: number
  offset: number
} {
  const result = PaginationQuerySchema.parse(query)
  return {
    page: result.page,
    limit: result.limit,
    offset: (result.page - 1) * result.limit,
  }
}
