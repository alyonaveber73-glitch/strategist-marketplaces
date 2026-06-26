import fs from 'node:fs/promises'
import path from 'node:path'
import type { Analysis, Project } from './types.js'

const DATA_DIR = path.resolve('server/data')
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json')

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function readProjects(): Promise<Project[]> {
  await ensureDataDir()
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf8')
    return JSON.parse(raw) as Project[]
  } catch {
    return []
  }
}

export async function writeProjects(projects: Project[]) {
  await ensureDataDir()
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8')
}

export async function upsertAnalysis(project: Project, analysis: Analysis) {
  const projects = await readProjects()
  const existing = projects.find((item) => item.id === project.id)
  if (existing) {
    existing.name = project.name
    existing.marketplace = project.marketplace
    existing.updatedAt = new Date().toISOString()
    existing.analyses.unshift(analysis)
  } else {
    projects.unshift({ ...project, analyses: [analysis] })
  }
  await writeProjects(projects)
  return projects.find((item) => item.id === project.id)!
}

export async function findAnalysis(analysisId: string) {
  const projects = await readProjects()
  for (const project of projects) {
    const analysis = project.analyses.find((item) => item.id === analysisId)
    if (analysis) return { project, analysis }
  }
  return null
}
