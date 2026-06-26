import type { Analysis, Project, UnitEconomics, User } from '../types/analytics'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787'
const TOKEN_KEY = 'marketplace-strategist-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

function headers(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function register(email: string, password: string, name: string) {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  if (!response.ok) throw new Error('Не удалось зарегистрироваться')
  const data = (await response.json()) as { user: User; token: string }
  setToken(data.token)
  return data.user
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error('Неверный email или пароль')
  const data = (await response.json()) as { user: User; token: string }
  setToken(data.token)
  return data.user
}

export async function me(): Promise<User | null> {
  if (!getToken()) return null
  const response = await fetch(`${API_BASE}/api/me`, { headers: headers() })
  if (!response.ok) return null
  const data = (await response.json()) as { user: User }
  return data.user
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/api/projects`, { headers: headers() })
  if (!response.ok) return []
  const data = (await response.json()) as { projects: Project[] }
  return data.projects
}

export async function fetchUnitEconomics(): Promise<UnitEconomics[]> {
  const response = await fetch(`${API_BASE}/api/unit-economics`, { headers: headers() })
  if (!response.ok) return []
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function saveUnitEconomics(items: Array<Partial<UnitEconomics> & { sku: string }>) {
  const response = await fetch(`${API_BASE}/api/unit-economics`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!response.ok) throw new Error('Не удалось сохранить справочник')
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function uploadAnalysis(file: File, projectName: string, projectId?: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('projectName', projectName)
  if (projectId) form.append('projectId', projectId)

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: headers(),
    body: form,
  })

  if (!response.ok) throw new Error('Не удалось обработать файл')
  return (await response.json()) as { project: Project; analysis: Analysis }
}

export function exportUrl(analysisId: string, format: 'xlsx' | 'pdf') {
  return `${API_BASE}/api/export/${analysisId}.${format}?token=${getToken()}`
}
