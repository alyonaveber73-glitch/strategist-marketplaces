import type { Analysis, Project } from '../types/analytics'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787'

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/api/projects`)
  if (!response.ok) return []
  const data = (await response.json()) as { projects: Project[] }
  return data.projects
}

export async function uploadAnalysis(file: File, projectName: string, projectId?: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('projectName', projectName)
  if (projectId) form.append('projectId', projectId)

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error('Не удалось обработать файл')
  }

  return (await response.json()) as { project: Project; analysis: Analysis }
}

export function exportUrl(analysisId: string, format: 'xlsx' | 'pdf') {
  return `${API_BASE}/api/export/${analysisId}.${format}`
}
