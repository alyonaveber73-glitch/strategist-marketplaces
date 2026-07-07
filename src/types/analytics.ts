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

export type DataQuality = {
  score: number
  recognizedReports: ReportType[]
  missingReports: ReportType[]
  warnings: string[]
  suggestions: string[]
}

export type Analysis = {
  id: string
  fileName: string
  createdAt: string
  reportTypes: ReportType[]
  rows: ProductMetric[]
  totals: Totals
  strategy: Strategy
  quality: DataQuality
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

export type User = {
  id: string
  email: string
  name: string
  createdAt: string
  subscriptionStatus: string
  subscriptionPlan: string | null
  subscriptionUntil: string | null
}

export type Payment = {
  id: string
  userId: string
  plan: string
  amount: number
  status: string
  confirmationUrl: string
  createdAt: string
}

export type AuthResponse = {
  user: User
  token: string
  expiresAt: string
}
