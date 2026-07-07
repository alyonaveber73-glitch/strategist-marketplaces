import type { NextFunction, Request, Response } from 'express'
import { getUserByToken, type User } from './db.js'

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
  return match?.[1] || ''
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getBearerToken(req)
  if (token) {
    const user = getUserByToken(token)
    if (user) {
      req.user = user
      req.authToken = token
    }
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Войдите в аккаунт.' })
      return
    }
    next()
  })
}
