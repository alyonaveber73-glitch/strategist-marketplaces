import type { Analysis, AuthResponse, Payment, UnitEconomics, User } from '../types/analytics'

const API_BASE = import.meta.env.VITE_API_BASE || ''
let authToken = localStorage.getItem('authToken') || ''

export function setAuthToken(token: string) {
  authToken = token
  if (token) localStorage.setItem('authToken', token)
  else localStorage.removeItem('authToken')
}

function authHeaders(headers: Record<string, string> = {}) {
  return authToken ? { ...headers, Authorization: `Bearer ${authToken}` } : headers
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { message?: string } | null
  return data?.message || fallback
}

export async function registerAccount(email: string, password: string, name: string) {
  const response = await fetch(`${API_BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось зарегистрироваться'))
  const data = await response.json() as AuthResponse
  setAuthToken(data.token)
  return data
}

export async function loginAccount(email: string, password: string) {
  const response = await fetch(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось войти'))
  const data = await response.json() as AuthResponse
  setAuthToken(data.token)
  return data
}

export async function logoutAccount() {
  await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: authHeaders() }).catch(() => null)
  setAuthToken('')
}

export async function fetchMe(): Promise<{ user: User; payments: Payment[] } | null> {
  if (!authToken) return null
  const response = await fetch(`${API_BASE}/api/me`, { headers: authHeaders() })
  if (!response.ok) { setAuthToken(''); return null }
  return await response.json() as { user: User; payments: Payment[] }
}

export async function createPayment(plan: string) {
  const response = await fetch(`${API_BASE}/api/payments/yookassa`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ plan, returnUrl: window.location.origin }) })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось создать платёж'))
  return await response.json() as { payment: Payment }
}

export async function fetchAnalyses(): Promise<Analysis[]> {
  const response = await fetch(`${API_BASE}/api/analyses`, { headers: authHeaders() })
  if (!response.ok) return []
  const data = (await response.json()) as { analyses: Analysis[] }
  return data.analyses
}

export async function fetchUnitEconomics(): Promise<UnitEconomics[]> {
  const response = await fetch(`${API_BASE}/api/unit-economics`, { headers: authHeaders() })
  if (!response.ok) return []
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function saveUnitEconomics(items: UnitEconomics[]) {
  const response = await fetch(`${API_BASE}/api/unit-economics`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ items }) })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось сохранить справочник'))
  const data = (await response.json()) as { items: UnitEconomics[] }
  return data.items
}

export async function importUnitEconomics(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/unit-economics/import`, { method: 'POST', headers: authHeaders(), body: form })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось импортировать справочник'))
  return (await response.json()) as { items: UnitEconomics[]; imported: number }
}

export async function uploadImageAnalysis(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/analyze-image`, { method: 'POST', headers: authHeaders(), body: form })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось проанализировать изображение'))
  return (await response.json()) as { analysis: Analysis }
}

export async function uploadAnalysis(files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', headers: authHeaders(), body: form })
  if (!response.ok) throw new Error(await readError(response, 'Не удалось обработать файл'))
  return (await response.json()) as { analysis: Analysis }
}

export function exportUrl(analysisId: string, format: 'xlsx' | 'pdf') {
  const tokenQuery = authToken ? `?token=${encodeURIComponent(authToken)}` : ''
  return `${API_BASE}/api/export/${analysisId}.${format}${tokenQuery}`
}
