import * as XLSX from 'xlsx'
import { detectPreset } from './reportPresets.js'
import type { ProductMetric, ReportType, Totals, UnitEconomics } from './types.js'

type RawRow = Record<string, string | number | null | undefined>

type ParsedWorkbookRow = { sheetName: string; reportType: ReportType; row: RawRow }

type UnitMap = Map<string, UnitEconomics>

const aliases = {
  sku: ['sku', 'артикул', 'id товара', 'товар', 'offer_id'],
  name: ['название', 'наименование', 'name', 'товара'],
  category: ['категория', 'предмет', 'category'],
  revenue: ['продаж', 'заказано', 'выруч', 'revenue', 'sales', 'оплачено', 'сумму'],
  orders: ['заказ', 'количество', 'orders', 'шт', 'продано товаров'],
  adSpend: ['расход', 'реклама', 'spend', 'с ндс'],
  margin: ['марж', 'margin', 'прибыль'],
  impressions: ['показ', 'impression'],
  clicks: ['клик', 'click'],
  carts: ['корзин', 'cart', 'добавления'],
  stock: ['остат', 'stock', 'доступно', 'склад'],
  promoRevenue: ['акци', 'скид', 'promo', 'промо'],
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/ё/g, 'е')
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value === null || value === undefined) return 0
  return Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0
}

function getByAliases(row: RawRow, names: string[]) {
  const entry = Object.entries(row).find(([key]) => {
    const normalized = normalizeHeader(key)
    return names.some((name) => normalized.includes(normalizeHeader(name)))
  })
  return entry?.[1] ?? ''
}

function detectReportType(sheetName: string, rows: RawRow[]): ReportType {
  const headersList = Object.keys(rows[0] || {})
  const preset = detectPreset(sheetName, headersList)
  if (preset) return preset.reportType

  const sheet = normalizeHeader(sheetName)
  const headers = headersList.map(normalizeHeader).join(' | ')
  const haystack = `${sheet} | ${headers}`

  if (haystack.match(/реклам|клик|показ|расход|затраты|cpc|ctr/)) return 'ads'
  if (haystack.match(/остат|склад|stock|fbo|fbs/)) return 'stocks'
  if (haystack.match(/акци|скид|промо|promo/)) return 'promotions'
  if (haystack.match(/заказ|продаж|выруч|оплачен|sales|перечислению/)) return 'sales'
  return 'unknown'
}

export function totals(rows: ProductMetric[]): Totals {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      orders: acc.orders + row.orders,
      adSpend: acc.adSpend + row.adSpend,
      margin: acc.margin + row.margin,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      carts: acc.carts + row.carts,
      stock: acc.stock + row.stock,
      promoRevenue: acc.promoRevenue + row.promoRevenue,
      costTotal: acc.costTotal + row.costTotal,
      commissionTotal: acc.commissionTotal + row.commissionTotal,
      acquiringTotal: acc.acquiringTotal + row.acquiringTotal,
      logisticsTotal: acc.logisticsTotal + row.logisticsTotal,
      taxTotal: acc.taxTotal + row.taxTotal,
    }),
    {
      revenue: 0,
      orders: 0,
      adSpend: 0,
      margin: 0,
      impressions: 0,
      clicks: 0,
      carts: 0,
      stock: 0,
      promoRevenue: 0,
      costTotal: 0,
      commissionTotal: 0,
      acquiringTotal: 0,
      logisticsTotal: 0,
      taxTotal: 0,
    },
  )
}

function emptyMetric(sku: string, name: string, category: string): ProductMetric {
  return {
    sku,
    name,
    category,
    revenue: 0,
    orders: 0,
    adSpend: 0,
    margin: 0,
    impressions: 0,
    clicks: 0,
    carts: 0,
    stock: 0,
    promoRevenue: 0,
    costTotal: 0,
    commissionTotal: 0,
    acquiringTotal: 0,
    logisticsTotal: 0,
    taxTotal: 0,
  }
}

function parseRows(parsedRows: ParsedWorkbookRow[], unitMap: UnitMap): ProductMetric[] {
  const grouped = new Map<string, ProductMetric>()

  for (const item of parsedRows) {
    const row = item.row
    const sku = String(getByAliases(row, aliases.sku) || `row-${grouped.size + 1}`).trim()
    const name = String(getByAliases(row, aliases.name) || sku).trim()
    const category = String(getByAliases(row, aliases.category) || 'Без категории').trim()
    const current = grouped.get(sku) ?? emptyMetric(sku, name, category)
    const unit = unitMap.get(sku)

    if (item.reportType === 'sales' || item.reportType === 'unknown') {
      current.revenue += toNumber(getByAliases(row, aliases.revenue))
      current.orders += toNumber(getByAliases(row, aliases.orders))
      current.margin += toNumber(getByAliases(row, aliases.margin))
    }

    if (item.reportType === 'ads' || item.reportType === 'unknown') {
      current.adSpend += toNumber(getByAliases(row, aliases.adSpend))
      current.impressions += toNumber(getByAliases(row, aliases.impressions))
      current.clicks += toNumber(getByAliases(row, aliases.clicks))
      current.carts += toNumber(getByAliases(row, aliases.carts))
    }

    if (item.reportType === 'stocks') {
      current.stock += toNumber(getByAliases(row, aliases.stock))
    }

    if (item.reportType === 'promotions') {
      current.promoRevenue += toNumber(getByAliases(row, aliases.promoRevenue)) || toNumber(getByAliases(row, aliases.revenue))
    }

    if (unit) {
      current.name = current.name || unit.name
      current.costTotal = current.orders * unit.cost
      current.commissionTotal = current.orders * unit.commission
      current.acquiringTotal = current.orders * unit.acquiring
      current.logisticsTotal = current.orders * unit.logistics
      current.taxTotal = current.revenue * unit.tax
    }

    grouped.set(sku, current)
  }

  for (const row of grouped.values()) {
    const calculatedMargin = row.revenue - row.adSpend - row.costTotal - row.commissionTotal - row.acquiringTotal - row.logisticsTotal - row.taxTotal
    if (row.costTotal || row.commissionTotal || row.acquiringTotal || row.logisticsTotal || row.taxTotal) row.margin = calculatedMargin
  }

  return [...grouped.values()].filter((row) => row.revenue || row.orders || row.adSpend || row.impressions || row.stock || row.promoRevenue)
}

export function analyzeBuffer(buffer: Buffer, fileName: string, unitMap: UnitMap = new Map()) {
  const lower = fileName.toLowerCase()
  const workbook = lower.endsWith('.csv') ? XLSX.read(buffer.toString('utf8'), { type: 'string' }) : XLSX.read(buffer, { type: 'buffer' })

  const reportTypes = new Set<ReportType>()
  const rawRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' })
    const reportType = detectReportType(sheetName, rows)
    reportTypes.add(reportType)
    return rows.map((row) => ({ sheetName, reportType, row }))
  })

  const rows = parseRows(rawRows, unitMap)
  return { rows, totals: totals(rows), sheetNames: workbook.SheetNames, reportTypes: [...reportTypes] }
}

export function parseUnitEconomicsBuffer(buffer: Buffer, fileName: string) {
  const lower = fileName.toLowerCase()
  const workbook = lower.endsWith('.csv') ? XLSX.read(buffer.toString('utf8'), { type: 'string' }) : XLSX.read(buffer, { type: 'buffer' })
  const rawRows = workbook.SheetNames.flatMap((sheetName) => XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[sheetName], { defval: '' }))

  return rawRows
    .map((row) => ({
      sku: String(getByAliases(row, ['sku', 'артикул', 'nmId', 'barcode', 'баркод']) || '').trim(),
      name: String(getByAliases(row, ['название', 'товар', 'name', 'предмет']) || '').trim(),
      cost: toNumber(getByAliases(row, ['себестоимость', 'cost'])),
      commission: toNumber(getByAliases(row, ['комиссия', 'commission'])),
      acquiring: toNumber(getByAliases(row, ['эквайринг', 'acquiring'])),
      logistics: toNumber(getByAliases(row, ['логистика', 'logistics'])),
      tax: toNumber(getByAliases(row, ['налог', 'tax'])) || toNumber(getByAliases(row, ['налог %', 'tax %'])) / 100,
    }))
    .filter((item) => item.sku)
}
