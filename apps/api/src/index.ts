import type { Request, Response } from 'express'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pino from 'pino'
import pinoHttp from 'pino-http'
import multer from 'multer'
import { parse } from 'csv-parse'
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { OrgCreateSchema, DatasetCreateSchema, ForecastRequestSchema } from './validation'
import { requireOrgRole } from './rbac'
import { mountSwagger } from './swagger'
import { authMiddleware } from './auth'

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const upload = multer({ storage: multer.memoryStorage() })

// Parse CORS origins from environment variable
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

app.use(helmet())
app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json({ limit: '5mb' }))
app.use(pinoHttp({ logger }))
app.use(rateLimit({ windowMs: 60_000, max: 300 }))
app.use(authMiddleware)

mountSwagger(app)
app.get('/health', (_req, res) => res.json({ ok: true }))

// Helper: verify dataset belongs to organization
async function verifyDatasetOwnership(datasetId: string, orgId: string): Promise<boolean> {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } })
  return dataset?.organizationId === orgId
}

// Create organization
app.post('/orgs', async (req: Request, res: Response) => {
  const parsed = OrgCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }
  const user = req.user
  const org = await prisma.organization.create({ data: { name: parsed.data.name } })
  if (user) {
    await prisma.membership.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    })
  }
  res.json(org)
})

// Create dataset
app.post(
  '/datasets',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST']),
  async (req: Request, res: Response) => {
    const orgId = req.orgId
    if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

    const parsed = DatasetCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() })
    }

    const ds = await prisma.dataset.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
    })
    res.json(ds)
  },
)

// CSV import: date,value
app.post('/datasets/:id/points/csv',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST']),
  upload.single('file'),
  async (req: Request, res: Response) => {
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })
  const datasetId = req.params.id

  // Verify dataset belongs to organization
  if (!(await verifyDatasetOwnership(datasetId, orgId))) {
    return res.status(403).json({ error: 'Dataset not found or access denied' })
  }

  if (!req.file) return res.status(400).json({ error: 'file required' })
  const csv = req.file.buffer.toString('utf8')
  const records: { date: Date; value: number }[] = []
  await new Promise<void>((resolve, reject) => {
    parse(csv, { columns: true, skip_empty_lines: true, trim: true }, (err, rows: any[]) => {
      if (err) return reject(err)
      for (const r of rows) {
        const d = new Date(r.date || r.Date)
        const v = Number(r.value ?? r.Value)
        if (!isFinite(v) || isNaN(d.getTime())) continue
        records.push({ date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), value: v })
      }
      resolve()
    })
  })
  for (const r of records) {
    await prisma.dataPoint.upsert({
      where: { datasetId_date: { datasetId, date: r.date } },
      update: { value: new Prisma.Decimal(r.value) },
      create: { datasetId, date: r.date, value: new Prisma.Decimal(r.value) },
    })
  }
  res.json({ imported: records.length })
})

// Naive forecast: mean of last 3 months  + MAPE + Alerts
app.post(
  '/datasets/:id/forecast',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST']),
  async (req: Request, res: Response) => {
    const orgId = req.orgId
    if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

    const datasetId = req.params.id

    // Verify dataset belongs to organization
    if (!(await verifyDatasetOwnership(datasetId, orgId))) {
      return res.status(403).json({ error: 'Dataset not found or access denied' })
    }

    const parsed = ForecastRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() })
    }
    const horizon = parsed.data.horizon
  const points = await prisma.dataPoint.findMany({ where: { datasetId }, orderBy: { date: 'asc' } })
  if (points.length < 3) return res.status(400).json({ error: 'need at least 3 points' })
  const last3 = points.slice(-3).map((p) => Number(p.value))
  const mean = last3.reduce((a, b) => a + b, 0) / last3.length
  const lastDate = points[points.length - 1].date
  const results = [] as { date: Date; predicted: number }[]
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + i, 1))
    results.push({ date: d, predicted: Math.round(mean * 100) / 100 })
  }
  // MAPE on last three (skip zero values to avoid division by zero)
  const nonZeroValues = last3.filter(v => v !== 0)
  const mape = nonZeroValues.length > 0
    ? (nonZeroValues.reduce((acc, v) => acc + Math.abs((v - mean) / v), 0) / nonZeroValues.length) * 100
    : 0

  const run = await prisma.forecastRun.create({
    data: { organizationId: orgId, datasetId, status: 'DONE' as any, horizon, mape },
  })
  for (const r of results) {
    await prisma.forecastResult.create({ data: { runId: run.id, date: r.date, predicted: new Prisma.Decimal(r.predicted) } })
  }
  // Alert evaluation (compare next prediction with last actual)
  const rules = await prisma.alertRule.findMany({ where: { datasetId, active: true } })
  if (rules.length && results.length) {
    const nextPred = results[0].predicted
    const lastActual = Number(points[points.length - 1].value)
    if (lastActual) {
      const pctDiff = Math.abs((nextPred - lastActual) / lastActual) * 100
      for (const rule of rules) {
        if (pctDiff >= rule.thresholdPct) {
          await prisma.alertEvent.create({
            data: {
              organizationId: orgId,
              ruleId: rule.id,
              datasetId,
              message: `Forecast change ${pctDiff.toFixed(
                2,
              )}% exceeds threshold ${rule.thresholdPct}%`,
            },
          })
        }
      }
    }
  }
  res.json({ runId: run.id, results, mape })
},
)

// Dashboard: last 12 actual + last forecast results
app.get('/dashboard/:id',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
  async (req: Request, res: Response) => {
  const datasetId = req.params.id
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

  // Verify dataset belongs to organization
  if (!(await verifyDatasetOwnership(datasetId, orgId))) {
    return res.status(403).json({ error: 'Dataset not found or access denied' })
  }

  const actual = await prisma.dataPoint.findMany({ where: { datasetId }, orderBy: { date: 'asc' }, take: -12 as any })
  const lastRun = await prisma.forecastRun.findFirst({ where: { datasetId }, orderBy: { createdAt: 'desc' } })
  const forecast = lastRun ? await prisma.forecastResult.findMany({ where: { runId: lastRun.id }, orderBy: { date: 'asc' } }) : []
  res.json({ actual, forecast })
})

// CSV export
app.get('/datasets/:id/export.csv',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST']),
  async (req: Request, res: Response) => {
  const datasetId = req.params.id
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

  // Verify dataset belongs to organization
  if (!(await verifyDatasetOwnership(datasetId, orgId))) {
    return res.status(403).json({ error: 'Dataset not found or access denied' })
  }

  const points = await prisma.dataPoint.findMany({ where: { datasetId }, orderBy: { date: 'asc' } })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="dataset-${datasetId}.csv"`)
  res.write('date,value\n')
  for (const p of points) {
    const d = p.date.toISOString().slice(0, 10)
    res.write(`${d},${p.value}\n`)
  }
  res.end()
})
// ---------------- Additional endpoints ----------------

// List organizations of current user
app.get('/orgs', async (req: Request, res: Response) => {
  const user = req.user
  if (!user) return res.json([])
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
  })
  res.json(memberships.map((m) => m.organization))
})

// List datasets of current organization
app.get('/datasets',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
  async (req: Request, res: Response) => {
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })
  const list = await prisma.dataset.findMany({ where: { organizationId: orgId } })
  res.json(list)
})

// Create alert rule on dataset
app.post(
  '/datasets/:id/alerts',
  requireOrgRole(['OWNER', 'ADMIN']),
  async (req: Request, res: Response) => {
    const datasetId = req.params.id
    const orgId = req.orgId
    if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

    // Verify dataset belongs to organization
    if (!(await verifyDatasetOwnership(datasetId, orgId))) {
      return res.status(403).json({ error: 'Dataset not found or access denied' })
    }

    const { name, thresholdPct, severity } = req.body || {}
    if (!name || typeof thresholdPct !== 'number')
      return res.status(400).json({ error: 'name and thresholdPct required' })
    if (thresholdPct < 0 || thresholdPct > 1000)
      return res.status(400).json({ error: 'thresholdPct must be between 0 and 1000' })
    if (severity && !['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(severity))
      return res.status(400).json({ error: 'severity must be INFO, WARNING, ERROR, or CRITICAL' })
    const rule = await prisma.alertRule.create({
      data: {
        organizationId: orgId,
        datasetId,
        name: name.toString(),
        thresholdPct,
        severity: severity || 'WARNING',
      },
    })
    res.json(rule)
  },
)

// List alert rules
app.get('/datasets/:id/alerts',
  requireOrgRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
  async (req: Request, res: Response) => {
  const datasetId = req.params.id
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

  // Verify dataset belongs to organization
  if (!(await verifyDatasetOwnership(datasetId, orgId))) {
    return res.status(403).json({ error: 'Dataset not found or access denied' })
  }

  const rules = await prisma.alertRule.findMany({ where: { datasetId } })
  res.json(rules)
})


const port = Number(process.env.PORT || 3000)
app.listen(port, () => logger.info({ port }, 'API listening'))
