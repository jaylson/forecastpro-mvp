import { z } from 'zod'

export const OrgCreateSchema = z.object({
  name: z.string().min(2).max(120),
})

export const DatasetCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
})

export const ForecastRequestSchema = z.object({
  horizon: z.number().int().min(1).max(24).default(3),
})

export type OrgCreate = z.infer<typeof OrgCreateSchema>
export type DatasetCreate = z.infer<typeof DatasetCreateSchema>
export type ForecastRequest = z.infer<typeof ForecastRequestSchema>
