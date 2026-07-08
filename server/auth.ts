import type { NextFunction, Request, Response } from 'express'
import { getUserByToken, hasActiveSubscription, type User } from './db.js'

declare global {
  namespace Express {
    interface Request {
      user?: User
      authToken?: string
    }
  }
}

export function getBearerToken(req: Request) {
  const header = req.header('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const queryToken = typeof req.query.token === 'string' ? req.query.token : ''
  return match?.[1] || queryToken
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req)
    if (token) {
      const user = await getUserByToken(token)
      if (user) {
        req.user = user
        req.authToken = token
      }
    }
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await optionalAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error)
      return
    }
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Войдите в аккаунт.' })
      return
    }
    next()
  })
}

export async function requireSubscription(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error)
      return
    }
    if (!req.user) return
    if (!hasActiveSubscription(req.user)) {
      res.status(403).json({ error: 'SUBSCRIPTION_REQUIRED', message: 'Для доступа нужна активная подписка.' })
      return
    }
    next()
  })
}
