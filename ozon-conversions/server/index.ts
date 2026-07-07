import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = Number(process.env.PORT || 8788)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../dist')

const METRICS = ['revenue', 'ordered_units', 'hits_view_search', 'hits_tocart_search', 'session_view_search']

type OzonAnalyticsItem = {
  dimensions?: Array<{ id?: string | number; name?: string }>
  metrics?: number[]
}

type OzonAnalyticsResponse = {
  result?: { data?: OzonAnalyticsItem[]; totals?: number[] }
}

type OzonConversionRow = {
  sku: string
  name: string
  revenue: number
  orders: number
  impressions: number
  clicks: number
  carts: number
  viewToCart: number
  cartToOrder: number
  viewToOrder: number
}

function dateDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function asNumber(value: unknown) {
  return Number(value || 0)
}

async function fetchOzonConversions() {
  const clientId = process.env.OZON_CLIENT_ID
  const apiKey = process.env.OZON_API_KEY
  if (!clientId || !apiKey) {
    const error = new Error('Добавьте OZON_CLIENT_ID и OZON_API_KEY в .env этого проекта.')
    error.name = 'OZON_KEYS_MISSING'
    throw error
  }

  const dateFrom = process.env.OZON_DATE_FROM || dateDaysAgo(30)
  const dateTo = process.env.OZON_DATE_TO || dateDaysAgo(1)
  const response = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: dateFrom,
      date_to: dateTo,
      metrics: METRICS,
      dimension: ['sku'],
      filters: [],
      sort: [{ key: 'revenue', order: 'DESC' }],
      limit: Number(process.env.OZON_ANALYTICS_LIMIT || 1000),
      offset: 0,
    }),
  })

  const data = await response.json().catch(() => ({})) as OzonAnalyticsResponse & { message?: string; error?: string }
  if (!response.ok) throw new Error(data.message || data.error || 'Ozon Seller API вернул ошибку')

  const rows: OzonConversionRow[] = (data.result?.data || []).map((item) => {
    const sku = item.dimensions?.[0]
    const metrics = item.metrics || []
    const revenue = asNumber(metrics[0])
    const orders = asNumber(metrics[1])
    const impressions = asNumber(metrics[2])
    const carts = asNumber(metrics[3])
    const clicks = asNumber(metrics[4])
    return {
      sku: String(sku?.id || ''),
      name: sku?.name || `SKU ${sku?.id || ''}`,
      revenue,
      orders,
      impressions,
      clicks,
      carts,
      viewToCart: carts / Math.max(impressions, 1),
      cartToOrder: orders / Math.max(carts, 1),
      viewToOrder: orders / Math.max(impressions, 1),
    }
  })

  return { rows, period: { from: dateFrom, to: dateTo }, source: 'ozon-seller-api' }
}

app.use(cors())
app.use(express.json())
app.use(express.static(distPath, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ozon: Boolean(process.env.OZON_CLIENT_ID && process.env.OZON_API_KEY) })
})

app.get('/api/ozon/conversions', async (_req, res, next) => {
  try {
    res.json(await fetchOzonConversions())
  } catch (error) {
    if (error instanceof Error && error.name === 'OZON_KEYS_MISSING') {
      res.status(400).json({ error: 'OZON_KEYS_MISSING', message: error.message })
      return
    }
    next(error)
  }
})

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Ошибка сервера' })
})

app.listen(PORT, () => console.log(`Ozon conversions listening on http://localhost:${PORT}`))
