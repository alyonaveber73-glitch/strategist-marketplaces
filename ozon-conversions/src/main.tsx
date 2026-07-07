import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

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

type ApiResponse = {
  rows: OzonConversionRow[]
  period: { from: string; to: string }
  source: string
}

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}

function number(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function App() {
  const [rows, setRows] = useState<OzonConversionRow[]>([])
  const [period, setPeriod] = useState('')
  const [message, setMessage] = useState('Добавьте Client-Id и Api-Key в .env, затем нажмите обновить.')
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => `${row.sku} ${row.name}`.toLowerCase().includes(needle))
  }, [query, rows])

  const totals = useMemo(() => filteredRows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    orders: acc.orders + row.orders,
    impressions: acc.impressions + row.impressions,
    clicks: acc.clicks + row.clicks,
    carts: acc.carts + row.carts,
  }), { revenue: 0, orders: 0, impressions: 0, clicks: 0, carts: 0 }), [filteredRows])

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/ozon/conversions')
      const data = await response.json().catch(() => null) as (ApiResponse & { message?: string }) | null
      if (!response.ok) throw new Error(data?.message || 'Не удалось получить данные Ozon')
      setRows(data?.rows || [])
      setPeriod(data ? `${data.period.from} — ${data.period.to}` : '')
      setMessage(`Загружено строк: ${data?.rows.length || 0}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  return <main className="shell">
    <section className="hero">
      <p className="eyebrow">Ozon Seller API</p>
      <h1>Таблица конверсий Ozon</h1>
      <p>Отдельный мини‑проект для анализа воронки по SKU: показы, переходы, корзины, заказы и конверсии.</p>
      <div className="actions">
        <button onClick={load} disabled={loading}>{loading ? 'Загружаю…' : 'Обновить из Ozon'}</button>
        <input placeholder="Поиск по SKU или названию" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <small>{period ? `Период: ${period}. ` : ''}{message}</small>
    </section>

    <section className="metrics">
      <article><span>Выручка</span><strong>{money(totals.revenue)}</strong></article>
      <article><span>Показы</span><strong>{number(totals.impressions)}</strong></article>
      <article><span>Переходы</span><strong>{number(totals.clicks)}</strong></article>
      <article><span>Корзины</span><strong>{number(totals.carts)}</strong></article>
      <article><span>Заказы</span><strong>{number(totals.orders)}</strong></article>
      <article><span>Показ → заказ</span><strong>{percent(totals.orders / Math.max(totals.impressions, 1))}</strong></article>
    </section>

    <section className="panel">
      <div className="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Товар</th><th>Выручка</th><th>Показы</th><th>Переходы</th><th>Корзины</th><th>Заказы</th><th>Показ → корзина</th><th>Корзина → заказ</th><th>Показ → заказ</th></tr></thead>
          <tbody>{filteredRows.length ? filteredRows.map((row) => <tr key={row.sku}>
            <td><strong>{row.sku}</strong></td><td>{row.name}</td><td>{money(row.revenue)}</td><td>{number(row.impressions)}</td><td>{number(row.clicks)}</td><td>{number(row.carts)}</td><td>{number(row.orders)}</td><td>{percent(row.viewToCart)}</td><td>{percent(row.cartToOrder)}</td><td>{percent(row.viewToOrder)}</td>
          </tr>) : <tr><td colSpan={10}>Пока данных нет. Нажмите «Обновить из Ozon».</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
