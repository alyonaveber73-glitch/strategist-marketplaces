import 'dotenv/config'
import { DatabaseSync } from 'node:sqlite'
import { scryptSync, randomBytes } from 'node:crypto'
import path from 'node:path'

const [, , emailArg, passwordArg] = process.argv
if (!emailArg || !passwordArg || passwordArg.length < 6) {
  console.error('Usage: node scripts/set-password.mjs user@example.com new-password-min-6')
  process.exit(1)
}

const email = emailArg.trim().toLowerCase()
const salt = randomBytes(16).toString('hex')
const passwordHash = `${salt}:${scryptSync(passwordArg, salt, 64).toString('hex')}`
const dbPath = path.resolve(process.env.DATA_DIR || 'data', 'app.sqlite')
const db = new DatabaseSync(dbPath)
const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(passwordHash, email)

if (!result.changes) {
  console.error(`User not found: ${email}`)
  process.exit(2)
}
console.log(`Password updated in SQLite for ${email}`)
