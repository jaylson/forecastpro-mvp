import type { Request, Response, NextFunction } from 'express'
import * as admin from 'firebase-admin'
import { prisma } from './prisma'

let adminInitialized = false
function initFirebase() {
  if (adminInitialized) return
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      admin.initializeApp({ credential: admin.credential.cert(json) })
    } else {
      admin.initializeApp()
    }
    adminInitialized = true
  } catch (e) {
    adminInitialized = true
  }
}

export interface AuthedRequest extends Request {
  user?: { id: string; email: string }
  orgId?: string
}

export async function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  // SECURITY WARNING: AUTH_DISABLED bypasses all authentication
  // This should ONLY be used in local development environments
  if (process.env.AUTH_DISABLED === 'true') {
    // Prevent accidental use in production
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL SECURITY ERROR: AUTH_DISABLED cannot be used in production!')
      throw new Error('AUTH_DISABLED is not allowed in production environment')
    }

    // Log warning every time auth is bypassed
    console.warn('⚠️  WARNING: Authentication is DISABLED - using demo user for all requests')

    const user = await prisma.user.findUnique({ where: { email: 'demo@forecastpro.local' } })
    if (user) req.user = { id: user.id, email: user.email }
    req.orgId = req.header('x-org-id') || 'seed-org'
    return next()
  }

  initFirebase()
  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return next()
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const email = decoded.email || `${decoded.uid}@firebase.local`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName: decoded.name || null },
    })
    req.user = { id: user.id, email: user.email }
    req.orgId = req.header('x-org-id') || undefined
  } catch (_) {}
  next()
}
