import type { Analysis, UnitEconomics } from '../types/analytics'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function fetchAnalyses(): Promise<Analysis[]> {
  const response = await fetch(`${API_BASE}/api/analyses`)
  if (!response.ok) return []
  const data = (await response.json()) as { analyses: Analysis[] }
  return data.analyses
}

export async function fetchUnitEconomics(): Promise<UnitEconomics[]> {
  const response = await fetch(`${API_BASE}/api/unit-economics`)
  if (!response.ok) return []
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function saveUnitEconomics(items: UnitEconomics[]) {
  const response = await fetch(`${API_BASE}/api/unit-economics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!response.ok) throw new Error('Не удалось сохранить справочник')
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function importUnitEconomics(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/unit-economics/import`, { method: 'POST', body: form })
  if (!response.ok) throw new Error('Не удалось импортировать справочник')
  return (await response.json()) as { items: UnitEconomics[]; imported: number }
}


export async function uploadImageAnalysis(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/analyze-image`, { method: 'POST', body: form })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(data?.message || 'Не удалось проанализировать изображение')
  }
  return (await response.json()) as { analysis: Analysis }
}

export async function uploadAnalysis(files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: form })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(data?.message || 'Не удалось обработать файл')
  }
  return (await response.json()) as { analysis: Analysis }
}

export function exportUrl(analysisId: string, format: 'xlsx' | 'pdf') {
  return `${API_BASE}/api/export/${analysisId}.${format}`
}
