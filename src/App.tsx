import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

type ProductMetric = {
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

type Strategy = {
  headline: string
  risks: string[]
  actions: string[]
  focusProducts: ProductMetric[]
}

const demoRows: ProductMetric[] = [
  {
    sku: '3834285502',
    name: 'Молочко-тонер увлажняющий',
    category: 'Тоники',
    revenue: 146_211,
    orders: 151,
    adSpend: 16_790,
    margin: 46_815,
    impressions: 55_202,
    clicks: 2_946,
    carts: 822,
  },
  {
    sku: '3866840308',
    name: 'BB-крем для лица',
    category: 'BB-крем',
    revenue: 127_673,
    orders: 133,
    adSpend: 25_667,
    margin: 21_448,
    impressions: 83_126,
    clicks: 3_110,
    carts: 771,
  },
  {
    sku: '3834234432',
    name: 'Блеск для губ',
    category: 'Блеск',
    revenue: 85_354,
    orders: 132,
    adSpend: 19_460,
    margin: 7_614,
    impressions: 95_112,
    clicks: 3_968,
    carts: 1_102,
  },
  {
    sku: '3834370542',
    name: 'Сыворотка с ниацинамидом',
    category: 'Сыворотки',
    revenue: 72_921,
    orders: 91,
    adSpend: 11_923,
    margin: 18_406,
    impressions: 41_599,
    clicks: 1_252,
    carts: 404,
  },
]

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function totals(rows: ProductMetric[]) {
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

function buildStrategy(rows: ProductMetric[]): Strategy {
  const sortedByMargin = [...rows].sort((a, b) => b.margin - a.margin)
  const highSpendLowMargin = [...rows]
    .filter((row) => row.adSpend / Math.max(row.revenue, 1) > 0.2 || row.margin / Math.max(row.revenue, 1) < 0.15)
    .sort((a, b) => b.adSpend - a.adSpend)

  return {
    headline: 'Сфокусироваться на товарах с высокой маржой, урезать неэффективную рекламу и усилить карточки с хорошей конверсией.',
    focusProducts: sortedByMargin.slice(0, 3),
    risks: [
      highSpendLowMargin[0]
        ? `Высокий ДДР или слабая маржа у товара «${highSpendLowMargin[0].name}». Нужна чистка рекламных кампаний.`
        : 'Критичных провалов по рекламе не видно, можно масштабировать лидеров.',
      'Часть продаж зависит от нескольких SKU — важно не допустить out-of-stock по лидерам.',
      'Если конверсия корзина→заказ ниже 20%, нужно проверить цену, отзывы, фото и оффер.',
    ],
    actions: [
      'На 7 дней оставить бюджет только на SKU с положительной маржой и ДДР ниже целевого.',
      'Для ТОП-3 товаров обновить первые 3 фото, оффер и SEO-заголовок под частотные запросы.',
      'Собрать отдельный список кампаний: отключить запросы без заказов, поднять ставки на запросы с заказами.',
      'Проверить остатки по товарам-лидерам и рассчитать поставку минимум на 30 дней.',
      'Через неделю сравнить: продажи, ДДР, маржа, конверсия показ→клик и корзина→заказ.',
    ],
  }
}

type RawRow = Record<string, string | number | null | undefined>

const aliases = {
  sku: ['sku', 'артикул', 'id товара', 'товар'],
  name: ['название', 'наименование', 'name'],
  category: ['категория', 'предмет', 'category'],
  revenue: ['продаж', 'заказано', 'выруч', 'revenue', 'sales', 'оплачено'],
  orders: ['заказ', 'количество', 'orders', 'шт'],
  adSpend: ['расход', 'реклама', 'spend'],
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

function parseCsv(text: string): ProductMetric[] {
  const workbook = XLSX.read(text, { type: 'string' })
  return parseWorkbook(workbook)
}

function parseWorkbook(workbook: XLSX.WorkBook): ProductMetric[] {
  const parsedRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' })
  })

  return parseRows(parsedRows)
}

async function parseFile(file: File): Promise<ProductMetric[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv') {
    return parseCsv(await file.text())
  }

  if (['xlsx', 'xls', 'ods'].includes(extension ?? '')) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    return parseWorkbook(workbook)
  }

  throw new Error('UNSUPPORTED_FILE')
}

export default function App() {
  const [rows, setRows] = useState<ProductMetric[]>(demoRows)
  const [fileName, setFileName] = useState('Демо-данные The Sonica')

  const total = useMemo(() => totals(rows), [rows])
  const strategy = useMemo(() => buildStrategy(rows), [rows])

  const ddr = total.adSpend / Math.max(total.revenue, 1)
  const marginRate = total.margin / Math.max(total.revenue, 1)
  const ctr = total.clicks / Math.max(total.impressions, 1)
  const cartConversion = total.carts / Math.max(total.clicks, 1)
  const orderConversion = total.orders / Math.max(total.carts, 1)

  async function onFileUpload(file: File | null) {
    if (!file) return
    setFileName(file.name)

    try {
      const parsed = await parseFile(file)
      if (parsed.length) {
        setRows(parsed)
      } else {
        alert('Не получилось распознать колонки. Пока оставила демо-данные.')
      }
    } catch {
      alert('Пока поддержаны CSV, XLSX, XLS и ODS. Попробуй загрузить файл в одном из этих форматов.')
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">AI-платформа для продавцов маркетплейсов</p>
          <h1>Стратег для маркетплейсов</h1>
          <p className="hero-text">
            Загружаете выгрузку из кабинета Ozon/WB — агент анализирует продажи, рекламу,
            маржу, остатки и конверсии, а затем собирает стратегию роста на месяц.
          </p>
          <div className="hero-actions">
            <label className="upload-button">
              Загрузить CSV/XLSX/ODS
              <input type="file" accept=".csv,.xlsx,.xls,.ods" onChange={(event) => onFileUpload(event.target.files?.[0] ?? null)} />
            </label>
            <span className="file-name">Источник: {fileName}</span>
          </div>
        </div>
        <aside className="strategy-card">
          <span>Стратегия месяца</span>
          <strong>{strategy.headline}</strong>
        </aside>
      </section>

      <section className="metrics-grid">
        <article><span>Продажи</span><strong>{money(total.revenue)}</strong></article>
        <article><span>Маржа</span><strong>{money(total.margin)}</strong><small>{percent(marginRate)}</small></article>
        <article><span>ДДР</span><strong>{percent(ddr)}</strong></article>
        <article><span>Заказы</span><strong>{total.orders.toFixed(0)}</strong></article>
        <article><span>Показ → клик</span><strong>{percent(ctr)}</strong></article>
        <article><span>Клик → корзина</span><strong>{percent(cartConversion)}</strong></article>
        <article><span>Корзина → заказ</span><strong>{percent(orderConversion)}</strong></article>
      </section>

      <section className="content-grid">
        <div className="panel wide">
          <div className="panel-header">
            <h2>ТОП товаров</h2>
            <p>Сортировка по продажам, с маржей и рекламной эффективностью.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Категория</th>
                  <th>Продажи</th>
                  <th>ДДР</th>
                  <th>Маржа</th>
                  <th>Конв. корзина→заказ</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.revenue - a.revenue).map((row) => (
                  <tr key={row.sku}>
                    <td><strong>{row.name}</strong><small>{row.sku}</small></td>
                    <td>{row.category}</td>
                    <td>{money(row.revenue)}</td>
                    <td>{percent(row.adSpend / Math.max(row.revenue, 1))}</td>
                    <td>{money(row.margin)}</td>
                    <td>{percent(row.orders / Math.max(row.carts, 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Риски</h2>
          <ul className="insight-list">
            {strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </div>

        <div className="panel">
          <h2>Рекомендации на месяц</h2>
          <ol className="action-list">
            {strategy.actions.map((action) => <li key={action}>{action}</li>)}
          </ol>
        </div>
      </section>
    </main>
  )
}
