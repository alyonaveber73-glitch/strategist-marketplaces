import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import type { Analysis, Project, UnitEconomics } from './types.js'

type ProjectRow = { id: string; user_id: string; name: string; marketplace: Project['marketplace']; created_at: string; updated_at: string }
type AnalysisRow = { id: string; project_id: string; file_name: string; report_types: string; rows_json: string; totals_json: string; strategy_json: string; created_at: string }
type UnitRow = { id: string; user_id: string; sku: string; name: string; cost: number; commission: number; acquiring: number; tax: number; logistics: number; created_at: string; updated_at: string }

function toAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    createdAt: row.created_at,
    reportTypes: JSON.parse(row.report_types),
    rows: JSON.parse(row.rows_json),
    totals: JSON.parse(row.totals_json),
    strategy: JSON.parse(row.strategy_json),
  }
}

function toProject(row: ProjectRow): Project {
  const analyses = db
    .prepare('SELECT * FROM analyses WHERE project_id = ? ORDER BY created_at DESC')
    .all(row.id) as AnalysisRow[]
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    marketplace: row.marketplace,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analyses: analyses.map(toAnalysis),
  }
}

function toUnit(row: UnitRow): UnitEconomics {
  return {
    id: row.id,
    userId: row.user_id,
    sku: row.sku,
    name: row.name,
    cost: row.cost,
    commission: row.commission,
    acquiring: row.acquiring,
    tax: row.tax,
    logistics: row.logistics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function readProjects(userId: string): Project[] {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as ProjectRow[]
  return rows.map(toProject)
}

export function upsertAnalysis(project: Project, analysis: Analysis) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(project.id, project.userId)
  if (existing) {
    db.prepare('UPDATE projects SET name = ?, marketplace = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      project.name,
      project.marketplace,
      now,
      project.id,
      project.userId,
    )
  } else {
    db.prepare('INSERT INTO projects (id, user_id, name, marketplace, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      project.id,
      project.userId,
      project.name,
      project.marketplace,
      project.createdAt,
      project.updatedAt,
    )
  }

  db.prepare(
    'INSERT INTO analyses (id, project_id, file_name, report_types, rows_json, totals_json, strategy_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    analysis.id,
    analysis.projectId,
    analysis.fileName,
    JSON.stringify(analysis.reportTypes),
    JSON.stringify(analysis.rows),
    JSON.stringify(analysis.totals),
    JSON.stringify(analysis.strategy),
    analysis.createdAt,
  )

  return toProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as ProjectRow)
}

export function findAnalysis(userId: string, analysisId: string) {
  const row = db
    .prepare('SELECT a.* FROM analyses a JOIN projects p ON p.id = a.project_id WHERE a.id = ? AND p.user_id = ?')
    .get(analysisId, userId) as AnalysisRow | undefined
  if (!row) return null
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(row.project_id, userId) as ProjectRow
  return { project: toProject(project), analysis: toAnalysis(row) }
}

export function updateAnalysisStrategy(analysis: Analysis) {
  db.prepare('UPDATE analyses SET strategy_json = ? WHERE id = ?').run(JSON.stringify(analysis.strategy), analysis.id)
}

export function listUnitEconomics(userId: string) {
  return (db.prepare('SELECT * FROM unit_economics WHERE user_id = ? ORDER BY sku').all(userId) as UnitRow[]).map(toUnit)
}

export function getUnitEconomicsMap(userId: string) {
  return new Map(listUnitEconomics(userId).map((unit) => [unit.sku, unit]))
}

export function upsertUnitEconomics(userId: string, items: Array<Partial<UnitEconomics> & { sku: string }>) {
  const now = new Date().toISOString()
  const statement = db.prepare(`
    INSERT INTO unit_economics (id, user_id, sku, name, cost, commission, acquiring, tax, logistics, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, sku) DO UPDATE SET
      name = excluded.name,
      cost = excluded.cost,
      commission = excluded.commission,
      acquiring = excluded.acquiring,
      tax = excluded.tax,
      logistics = excluded.logistics,
      updated_at = excluded.updated_at
  `)
  const transaction = db.transaction(() => {
    for (const item of items) {
      statement.run(
        item.id || randomUUID(),
        userId,
        item.sku,
        item.name || '',
        Number(item.cost || 0),
        Number(item.commission || 0),
        Number(item.acquiring || 0),
        Number(item.tax || 0),
        Number(item.logistics || 0),
        now,
        now,
      )
    }
  })
  transaction()
  return listUnitEconomics(userId)
}
