import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
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

type UserRow = {
  id: string
  email: string
  name: string | null
  created_at: string
  subscription_status: string | null
  subscription_plan: string | null
  subscription_until: string | null
}

type SessionRow = { user_id: string; expires_at: string }
type UnitRow = UnitEconomics
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

const dataDir = path.resolve(process.env.DATA_DIR || 'data')
fs.mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(path.join(dataDir, 'app.sqlite'))

db.exec(`
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

function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    createdAt: row.created_at,
    subscriptionStatus: row.subscription_status || 'inactive',
    subscriptionPlan: row.subscription_plan,
    subscriptionUntil: row.subscription_until,
  }
}

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

export function createUser(email: string, password: string, name = '') {
  const id = randomBytes(16).toString('hex')
  const createdAt = new Date().toISOString()
  db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, normalizeEmail(email), name.trim(), hashPassword(password), createdAt)
  return getUserById(id)
}

export function authenticateUser(email: string, password: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as (UserRow & { password_hash: string }) | undefined
  if (!row || !verifyPassword(password, row.password_hash)) return null
  return userFromRow(row)
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 30)
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, createdAt.toISOString(), expiresAt.toISOString())
  return { token, expiresAt: expiresAt.toISOString() }
}

export function getUserById(id: string) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? userFromRow(row) : null
}

export function getUserByToken(token: string) {
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as SessionRow | undefined
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null
  return getUserById(session.user_id)
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function listUnitEconomics() {
  return db.prepare('SELECT sku, name, cost, commission, acquiring, logistics, tax FROM unit_economics ORDER BY sku').all() as UnitRow[]
}

export function upsertUnitEconomics(items: UnitEconomics[]) {
  const statement = db.prepare(`
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
  const transaction = db.transaction((values: UnitEconomics[]) => {
    for (const item of values) {
      if (!item.sku) continue
      statement.run(String(item.sku), String(item.name || ''), Number(item.cost || 0), Number(item.commission || 0), Number(item.acquiring || 0), Number(item.logistics || 0), Number(item.tax || 0))
    }
  })
  transaction(items)
  return listUnitEconomics()
}

export function saveAnalysis(analysis: Analysis) {
  db.prepare(`
    INSERT INTO analyses (id, data, created_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at
  `).run(analysis.id, JSON.stringify(analysis), analysis.createdAt)
}

export function getAnalysis(id: string) {
  const row = db.prepare('SELECT data FROM analyses WHERE id = ?').get(id) as AnalysisRow | undefined
  return row ? JSON.parse(row.data) as Analysis : null
}

export function listAnalyses(limit = 20) {
  const rows = db.prepare('SELECT data FROM analyses ORDER BY created_at DESC LIMIT ?').all(limit) as AnalysisRow[]
  return rows.map((row) => JSON.parse(row.data) as Analysis)
}

export function savePayment(payment: Payment, rawResponse: unknown) {
  db.prepare(`
    INSERT INTO payments (id, user_id, plan, amount, status, confirmation_url, created_at, raw_response)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, confirmation_url = excluded.confirmation_url, raw_response = excluded.raw_response
  `).run(payment.id, payment.userId, payment.plan, payment.amount, payment.status, payment.confirmationUrl, payment.createdAt, JSON.stringify(rawResponse))
}

export function listPayments(userId: string) {
  const rows = db.prepare('SELECT id, user_id, plan, amount, status, confirmation_url, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId) as PaymentRow[]
  return rows.map((row) => ({ id: row.id, userId: row.user_id, plan: row.plan, amount: row.amount, status: row.status, confirmationUrl: row.confirmation_url || '', createdAt: row.created_at }))
}
