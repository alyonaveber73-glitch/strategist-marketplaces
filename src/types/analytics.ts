export type ReportType = 'sales' | 'ads' | 'stocks' | 'promotions' | 'unknown'

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
  stock: number
  promoRevenue: number
  costTotal: number
  commissionTotal: number
  acquiringTotal: number
  logisticsTotal: number
  taxTotal: number
}

export type Totals = Omit<ProductMetric, 'sku' | 'name' | 'category'>

export type Strategy = {
  headline: string
  risks: string[]
  actions: string[]
  focusProducts: ProductMetric[]
  source: 'rules' | 'ai'
}

export type Analysis = {
  id: string
  fileName: string
  createdAt: string
  reportTypes: ReportType[]
  rows: ProductMetric[]
  totals: Totals
  strategy: Strategy
}

export type UnitEconomics = {
  sku: string
  name?: string
  cost: number
  commission: number
  acquiring: number
  tax: number
  logistics: number
}
