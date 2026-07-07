import type { ProductMetric } from './types.js'

export type OzonConversionRow = {
  sku: string
  offerId: string
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

type OzonAnalyticsItem = {
  dimensions?: Array<{ id?: string | number; name?: string }>
  metrics?: number[]
}

type OzonAnalyticsResponse = {
  result?: { data?: OzonAnalyticsItem[]; totals?: number[] }
}

const METRICS = ['revenue', 'ordered_units', 'hits_view_search', 'hits_tocart_search', 'session_view_search']

function dateDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function asNumber(value: unknown) {
  return Number(value || 0)
}

export async function fetchOzonConversions() {
  const clientId = process.env.OZON_CLIENT_ID
  const apiKey = process.env.OZON_API_KEY
  if (!clientId || !apiKey) {
    const error = new Error('Добавьте OZON_CLIENT_ID и OZON_API_KEY в .env на VPS.')
    error.name = 'OZON_KEYS_MISSING'
    throw error
  }

  const response = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      date_from: process.env.OZON_DATE_FROM || dateDaysAgo(30),
      date_to: process.env.OZON_DATE_TO || dateDaysAgo(1),
      metrics: METRICS,
      dimension: ['sku'],
      filters: [],
      sort: [{ key: 'revenue', order: 'DESC' }],
      limit: Number(process.env.OZON_ANALYTICS_LIMIT || 1000),
      offset: 0,
    }),
  })

  const data = await response.json().catch(() => ({})) as OzonAnalyticsResponse & { message?: string; error?: string }
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Ozon Seller API вернул ошибку')
  }

  const rows: OzonConversionRow[] = (data.result?.data || []).map((item) => {
    const skuDimension = item.dimensions?.[0]
    const metrics = item.metrics || []
    const revenue = asNumber(metrics[0])
    const orders = asNumber(metrics[1])
    const impressions = asNumber(metrics[2])
    const carts = asNumber(metrics[3])
    const clicks = asNumber(metrics[4])
    return {
      sku: String(skuDimension?.id || ''),
      offerId: String(skuDimension?.id || ''),
      name: skuDimension?.name || `SKU ${skuDimension?.id || ''}`,
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

  return {
    rows,
    period: { from: process.env.OZON_DATE_FROM || dateDaysAgo(30), to: process.env.OZON_DATE_TO || dateDaysAgo(1) },
    source: 'ozon-seller-api',
  }
}

export function conversionsFromAnalyses(rows: ProductMetric[]): OzonConversionRow[] {
  return rows.map((row) => ({
    sku: row.sku,
    offerId: row.sku,
    name: row.name,
    revenue: row.revenue,
    orders: row.orders,
    impressions: row.impressions,
    clicks: row.clicks,
    carts: row.carts,
    viewToCart: row.carts / Math.max(row.impressions, 1),
    cartToOrder: row.orders / Math.max(row.carts, 1),
    viewToOrder: row.orders / Math.max(row.impressions, 1),
  }))
}
