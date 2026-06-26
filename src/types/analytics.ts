export type ProductMetric = {
  sku: string
  name: string
  category: string
  revenue: number
  orders: number
  adSpend: number
  margin: number
  impressions: number
  clicks: number
  carts: number
}

export type Totals = {
  revenue: number
  orders: number
  adSpend: number
  margin: number
  impressions: number
  clicks: number
  carts: number
}

export type Strategy = {
  headline: string
  risks: string[]
  actions: string[]
  focusProducts: ProductMetric[]
  source: 'rules' | 'ai'
}

export type Analysis = {
  id: string
  projectId: string
  fileName: string
  createdAt: string
  rows: ProductMetric[]
  totals: Totals
  strategy: Strategy
}

export type Project = {
  id: string
  name: string
  marketplace: 'ozon' | 'wildberries' | 'mixed' | 'unknown'
  createdAt: string
  updatedAt: string
  analyses: Analysis[]
}
