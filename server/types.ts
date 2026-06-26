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

export type Totals = {
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
  reportTypes: ReportType[]
  rows: ProductMetric[]
  totals: Totals
  strategy: Strategy
}

export type Project = {
  id: string
  userId: string
  name: string
  marketplace: 'ozon' | 'wildberries' | 'mixed' | 'unknown'
  createdAt: string
  updatedAt: string
  analyses: Analysis[]
}

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer'
export type Plan = 'free' | 'pro' | 'team'

export type User = {
  id: string
  email: string
  name: string
  createdAt: string
  role?: Role
  plan?: Plan
}

export type Invite = {
  id: string
  userId: string
  email: string
  role: Role
  token: string
  status: 'pending' | 'accepted' | 'expired'
  createdAt: string
}

export type UnitEconomics = {
  id: string
  userId: string
  sku: string
  name: string
  cost: number
  commission: number
  acquiring: number
  tax: number
  logistics: number
  createdAt: string
  updatedAt: string
}
