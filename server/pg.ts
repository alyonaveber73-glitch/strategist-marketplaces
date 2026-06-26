import pg from 'pg'

export const postgresEnabled = Boolean(process.env.DATABASE_URL)
export const pool = postgresEnabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null

export async function migratePostgres() {
  if (!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      report_types JSONB NOT NULL,
      rows_json JSONB NOT NULL,
      totals_json JSONB NOT NULL,
      strategy_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS unit_economics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      commission REAL NOT NULL DEFAULT 0,
      acquiring REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      logistics REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(user_id, sku)
    );
  `)
}
