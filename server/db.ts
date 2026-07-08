import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { plans, type PlanKey } from './payments.js'
import type { Analysis, UnitEconomics } from './types.js'

export type User = {
  id: string
  email: string
  name: string
  createdAt: string
  subscriptionStatus: string
  subscriptionPlan: string | null
  subscriptionUntil: string | null
}

export type Payment = {
  id: string
  userId: string
  plan: string
  amount: number
  status: string
  confirmationUrl: string
  createdAt: string
}

type UserRecord = User & { passwordHash: string }
type SessionRecord = { token: string; userId: string; createdAt: string; expiresAt: string }

type UserRow = {
  id: string
  email: string
  name: string | null
  password_hash: string
  created_at: string
  subscription_status: string | null
  subscription_plan: string | null
  subscription_until: string | null
}
type SessionRow = { user_id: string; expires_at: string }
type AnalysisRow = { data: string }
type PaymentRow = {
  id: string
  user_id: string
  plan: string
  amount: number
  status: string
  confirmation_url: string | null
  created_at: string
}
type SubscriptionRow = {
  status: string
  plan: string | null
  starts_at: string | null
  expires_at: string | null
}

const dataDir = path.resolve(process.env.DATA_DIR || 'data')
fs.mkdirSync(dataDir, { recursive: true })
const sqlite = new DatabaseSync(path.join(dataDir, 'app.sqlite'))

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_plan TEXT,
    subscription_until TEXT
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inactive',
    plan TEXT,
    starts_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS unit_economics (
    sku TEXT PRIMARY KEY,
    name TEXT,
    cost REAL NOT NULL DEFAULT 0,
    commission REAL NOT NULL DEFAULT 0,
    acquiring REAL NOT NULL DEFAULT 0,
    logistics REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    confirmation_url TEXT,
    created_at TEXT NOT NULL,
    raw_response TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === candidate.length && timingSafeEqual(expected, candidate)
}

function publicUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name || '',
    createdAt: record.createdAt,
    subscriptionStatus: record.subscriptionStatus || 'inactive',
    subscriptionPlan: record.subscriptionPlan || null,
    subscriptionUntil: record.subscriptionUntil || null,
  }
}

void publicUser

function userFromRow(row: UserRow): User {
  const subscription = activeSubscriptionForUser(row.id)
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    createdAt: row.created_at,
    subscriptionStatus: subscription?.status || row.subscription_status || 'inactive',
    subscriptionPlan: subscription?.plan || row.subscription_plan,
    subscriptionUntil: subscription?.expires_at || row.subscription_until,
  }
}

function activeSubscriptionForUser(userId: string) {
  return sqlite.prepare(`
    SELECT status, plan, starts_at, expires_at
    FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND unixepoch(expires_at) > unixepoch('now')
    ORDER BY expires_at DESC
    LIMIT 1
  `).get(userId) as SubscriptionRow | undefined
}

function syncUserSubscription(userId: string) {
  const subscription = activeSubscriptionForUser(userId)
  if (subscription) {
    sqlite.prepare('UPDATE users SET subscription_status = ?, subscription_plan = ?, subscription_until = ? WHERE id = ?')
      .run('active', subscription.plan, subscription.expires_at, userId)
    return
  }
  sqlite.prepare(`
    UPDATE users
    SET subscription_status = CASE WHEN subscription_until IS NOT NULL AND unixepoch(subscription_until) <= unixepoch('now') THEN 'expired' ELSE 'inactive' END
    WHERE id = ? AND subscription_status = 'active'
  `).run(userId)
}

export async function createUser(email: string, password: string, name = '') {
  const id = randomBytes(16).toString('hex')
  const createdAt = new Date().toISOString()
  const record: UserRecord = {
    id,
    email: normalizeEmail(email),
    name: name.trim(),
    passwordHash: hashPassword(password),
    createdAt,
    subscriptionStatus: 'inactive',
    subscriptionPlan: null,
    subscriptionUntil: null,
  }
  sqlite.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, record.email, record.name, record.passwordHash, createdAt)
  sqlite.prepare('INSERT INTO subscriptions (id, user_id, status, plan, starts_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomBytes(16).toString('hex'), id, 'inactive', null, null, null, createdAt)
  return getUserById(id)
}

export async function authenticateUser(email: string, password: string) {
  const row = sqlite.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined
  if (row) syncUserSubscription(row.id)
  return row && verifyPassword(password, row.password_hash) ? userFromRow(row) : null
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 30)
  const record: SessionRecord = { token, userId, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() }
  sqlite.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, record.createdAt, record.expiresAt)
  return { token, expiresAt: record.expiresAt }
}

export async function getUserById(id: string) {
  syncUserSubscription(id)
  const row = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? userFromRow(row) : null
}

export async function getUserByToken(token: string) {
  const session = sqlite.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as SessionRow | undefined
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null
  return getUserById(session.user_id)
}

export async function deleteSession(token: string) {
  sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export async function listUnitEconomics() {
  return sqlite.prepare('SELECT sku, name, cost, commission, acquiring, logistics, tax FROM unit_economics ORDER BY sku').all() as UnitEconomics[]
}

export async function upsertUnitEconomics(items: UnitEconomics[]) {
  const statement = sqlite.prepare(`
    INSERT INTO unit_economics (sku, name, cost, commission, acquiring, logistics, tax)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sku) DO UPDATE SET
      name = excluded.name,
      cost = excluded.cost,
      commission = excluded.commission,
      acquiring = excluded.acquiring,
      logistics = excluded.logistics,
      tax = excluded.tax
  `)
  const transaction = sqlite.transaction((values: UnitEconomics[]) => {
    for (const item of values) {
      if (!item.sku) continue
      statement.run(String(item.sku), String(item.name || ''), Number(item.cost || 0), Number(item.commission || 0), Number(item.acquiring || 0), Number(item.logistics || 0), Number(item.tax || 0))
    }
  })
  transaction(items)
  return listUnitEconomics()
}

export async function saveAnalysis(analysis: Analysis) {
  sqlite.prepare('INSERT INTO analyses (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at')
    .run(analysis.id, JSON.stringify(analysis), analysis.createdAt)
}

export async function getAnalysis(id: string) {
  const row = sqlite.prepare('SELECT data FROM analyses WHERE id = ?').get(id) as AnalysisRow | undefined
  return row ? JSON.parse(row.data) as Analysis : null
}

export async function listAnalyses(limit = 20) {
  const rows = sqlite.prepare('SELECT data FROM analyses ORDER BY created_at DESC LIMIT ?').all(limit) as AnalysisRow[]
  return rows.map((row) => JSON.parse(row.data) as Analysis)
}

export async function savePayment(payment: Payment, rawResponse: unknown) {
  sqlite.prepare('INSERT INTO payments (id, user_id, plan, amount, status, confirmation_url, created_at, raw_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, confirmation_url = excluded.confirmation_url, raw_response = excluded.raw_response')
    .run(payment.id, payment.userId, payment.plan, payment.amount, payment.status, payment.confirmationUrl, payment.createdAt, JSON.stringify(rawResponse))
  if (payment.status === 'succeeded' && payment.plan in plans) {
    activateUserSubscription(payment.userId, payment.plan as PlanKey)
  }
}

export async function listPayments(userId: string) {
  const rows = sqlite.prepare('SELECT id, user_id, plan, amount, status, confirmation_url, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId) as PaymentRow[]
  return rows.map((row) => ({ id: row.id, userId: row.user_id, plan: row.plan, amount: row.amount, status: row.status, confirmationUrl: row.confirmation_url || '', createdAt: row.created_at }))
}

export function hasActiveSubscription(user: User) {
  return user.subscriptionStatus === 'active' && Boolean(user.subscriptionUntil) && new Date(user.subscriptionUntil!).getTime() > Date.now()
}

export function activateUserSubscription(userId: string, plan: PlanKey) {
  const now = new Date()
  const current = activeSubscriptionForUser(userId)
  const baseTime = current?.expires_at ? Math.max(new Date(current.expires_at).getTime(), now.getTime()) : now.getTime()
  const expiresAt = new Date(baseTime + plans[plan].termDays * 24 * 60 * 60 * 1000).toISOString()
  const startsAt = now.toISOString()
  sqlite.prepare('INSERT INTO subscriptions (id, user_id, status, plan, starts_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomBytes(16).toString('hex'), userId, 'active', plan, startsAt, expiresAt, startsAt)
  sqlite.prepare('UPDATE users SET subscription_status = ?, subscription_plan = ?, subscription_until = ? WHERE id = ?')
    .run('active', plan, expiresAt, userId)
  return getUserById(userId)
}

export function storageEngine() {
  return 'sqlite'
}
