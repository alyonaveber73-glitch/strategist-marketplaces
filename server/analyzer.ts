import * as XLSX from 'xlsx'
import type { ProductMetric, Totals } from './types.js'

type RawRow = Record<string, string | number | null | undefined>

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
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value === null || value === undefined) return 0
  return Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0
}

function getByAliases(row: RawRow, names: string[]) {
  const entry = Object.entries(row).find(([key]) => {
    const normalized = key.trim().toLowerCase()
    return names.some((name) => normalized.includes(name))
  })
  return entry?.[1] ?? ''
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
    }),
    { revenue: 0, orders: 0, adSpend: 0, margin: 0, impressions: 0, clicks: 0, carts: 0 },
  )
}

function parseRows(rawRows: RawRow[]): ProductMetric[] {
  const grouped = new Map<string, ProductMetric>()

  for (const row of rawRows) {
    const sku = String(getByAliases(row, aliases.sku) || `row-${grouped.size + 1}`).trim()
    const name = String(getByAliases(row, aliases.name) || sku).trim()
    const category = String(getByAliases(row, aliases.category) || 'Без категории').trim()
    const current = grouped.get(sku) ?? {
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
    }

    current.revenue += toNumber(getByAliases(row, aliases.revenue))
    current.orders += toNumber(getByAliases(row, aliases.orders))
    current.adSpend += toNumber(getByAliases(row, aliases.adSpend))
    current.margin += toNumber(getByAliases(row, aliases.margin))
    current.impressions += toNumber(getByAliases(row, aliases.impressions))
    current.clicks += toNumber(getByAliases(row, aliases.clicks))
    current.carts += toNumber(getByAliases(row, aliases.carts))

    grouped.set(sku, current)
  }

  return [...grouped.values()].filter((row) => row.revenue || row.orders || row.adSpend || row.impressions)
}

export function analyzeBuffer(buffer: Buffer, fileName: string) {
  const lower = fileName.toLowerCase()
  const workbook = lower.endsWith('.csv')
    ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
    : XLSX.read(buffer, { type: 'buffer' })

  const rawRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' })
  })

  const rows = parseRows(rawRows)
  return { rows, totals: totals(rows), sheetNames: workbook.SheetNames }
}
