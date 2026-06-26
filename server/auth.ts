import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import type { User } from './types.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

type UserRow = { id: string; email: string; name: string; created_at: string }

declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at }
}

export function createToken(user: User) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
}

export function registerUser(email: string, password: string, name: string) {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const passwordHash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    email.toLowerCase(),
    passwordHash,
    name,
    createdAt,
  )
  return { id, email: email.toLowerCase(), name, createdAt }
}

export function loginUser(email: string, password: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as (UserRow & { password_hash: string }) | undefined
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return null
  return toUser(row)
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const queryToken = typeof req.query.token === 'string' ? req.query.token : ''
  const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken
  if (!token) {
    res.status(401).json({ error: 'AUTH_REQUIRED' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string }
    const row = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(decoded.sub) as UserRow | undefined
    if (!row) {
      res.status(401).json({ error: 'AUTH_REQUIRED' })
      return
    }
    req.user = toUser(row)
    next()
  } catch {
    res.status(401).json({ error: 'AUTH_REQUIRED' })
  }
}
