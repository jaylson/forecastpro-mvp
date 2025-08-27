import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: {},
    create: { id: 'seed-org', name: 'ForecastPro Demo' },
  })

  const user = await prisma.user.upsert({
    where: { email: 'demo@forecastpro.local' },
    update: {},
    create: { email: 'demo@forecastpro.local', displayName: 'Demo User' },
  })

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: Role.OWNER },
  })

  const ds = await prisma.dataset.upsert({
    where: { id: 'seed-dataset' },
    update: {},
    create: { id: 'seed-dataset', organizationId: org.id, name: 'Sales - Demo', currency: 'BRL' },
  })

  // Seed 12 months of dummy data
  const base = new Date()
  base.setUTCDate(1)
  base.setUTCHours(0, 0, 0, 0)
  const points = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - (11 - i), 1))
    const value = 1000 + (i * 50) + Math.round(Math.random() * 100)
    return { datasetId: ds.id, date: d, value }
  })
  for (const p of points) {
    await prisma.dataPoint.upsert({
      where: { datasetId_date: { datasetId: p.datasetId, date: p.date } },
      update: { value: p.value as any },
      create: p as any,
    })
  }

  console.log('Seeded:', { org: org.name, user: user.email, dataset: ds.name })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})
