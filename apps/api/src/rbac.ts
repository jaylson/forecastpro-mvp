import type { Request, Response, NextFunction } from 'express'
import { prisma } from './prisma'

export function requireOrgRole(roles: ('OWNER'|'ADMIN'|'ANALYST'|'VIEWER')[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req as any).orgId as string | undefined
    const user = (req as any).user as { id: string } | undefined
    if (!orgId) return res.status(400).json({ error: 'x-org-id header required' })

    // SECURITY WARNING: Bypass RBAC only when auth is disabled in development
    if (process.env.AUTH_DISABLED === 'true') {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Server misconfiguration' })
      }
      return next()
    }

    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const m = await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: orgId } } })
    if (!m) return res.status(403).json({ error: 'forbidden' })
    if (!roles.includes(m.role as any)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}
