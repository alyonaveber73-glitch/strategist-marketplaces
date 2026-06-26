import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { exportUrl, fetchProjects, uploadAnalysis } from './lib/api'
import type { Analysis, ProductMetric, Project, Strategy, Totals } from './types/analytics'

const demoRows: ProductMetric[] = [
  { sku: '3834285502', name: 'Молочко-тонер увлажняющий', category: 'Тоники', revenue: 146_211, orders: 151, adSpend: 16_790, margin: 46_815, impressions: 55_202, clicks: 2_946, carts: 822 },
  { sku: '3866840308', name: 'BB-крем для лица', category: 'BB-крем', revenue: 127_673, orders: 133, adSpend: 25_667, margin: 21_448, impressions: 83_126, clicks: 3_110, carts: 771 },
  { sku: '3834234432', name: 'Блеск для губ', category: 'Блеск', revenue: 85_354, orders: 132, adSpend: 19_460, margin: 7_614, impressions: 95_112, clicks: 3_968, carts: 1_102 },
  { sku: '3834370542', name: 'Сыворотка с ниацинамидом', category: 'Сыворотки', revenue: 72_921, orders: 91, adSpend: 11_923, margin: 18_406, impressions: 41_599, clicks: 1_252, carts: 404 },
]

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function totals(rows: ProductMetric[]): Totals {
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
  return {
    source: 'rules',
    headline: 'Сфокусироваться на товарах с высокой маржой, урезать неэффективную рекламу и усилить карточки с хорошей конверсией.',
    focusProducts: sortedByMargin.slice(0, 3),
    risks: ['Демо-режим: запустите сервер и загрузите файл, чтобы получить реальный анализ.', 'Проверьте остатки по лидерам продаж.', 'Следите за ДДР и маржинальностью по каждому SKU.'],
    actions: ['Загрузить реальную выгрузку Ozon/WB.', 'Проверить ТОП товаров по марже.', 'Отключить рекламу на SKU с низкой отдачей.', 'Сформировать план роста на 30 дней.'],
  }
}

function currentAnalysisFromDemo(): Analysis {
  const total = totals(demoRows)
  return {
    id: '',
    projectId: '',
    fileName: 'Демо-данные The Sonica',
    createdAt: new Date().toISOString(),
    rows: demoRows,
    totals: total,
    strategy: buildStrategy(demoRows),
  }
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>(currentAnalysisFromDemo)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectName, setProjectName] = useState('Новый проект Ozon')
  const [loading, setLoading] = useState(false)
  const [serverMessage, setServerMessage] = useState('Серверный анализатор: готов к подключению')

  const rows = analysis.rows
  const total = analysis.totals
  const strategy = analysis.strategy

  const ddr = total.adSpend / Math.max(total.revenue, 1)
  const marginRate = total.margin / Math.max(total.revenue, 1)
  const ctr = total.clicks / Math.max(total.impressions, 1)
  const cartConversion = total.carts / Math.max(total.clicks, 1)
  const orderConversion = total.orders / Math.max(total.carts, 1)

  const latestAnalyses = useMemo(() => projects.flatMap((project) => project.analyses.map((item) => ({ ...item, projectName: project.name }))).slice(0, 6), [projects])

  useEffect(() => {
    fetchProjects()
      .then((loaded) => {
        setProjects(loaded)
        if (loaded[0]?.analyses[0]) setAnalysis(loaded[0].analyses[0])
      })
      .catch(() => setServerMessage('Сервер пока не запущен — показываю демо-режим'))
  }, [])

  async function onFileUpload(file: File | null) {
    if (!file) return
    setLoading(true)
    setServerMessage('Загружаю файл на сервер и считаю метрики…')

    try {
      const result = await uploadAnalysis(file, projectName)
      setAnalysis(result.analysis)
      setProjects(await fetchProjects())
      setServerMessage(`Готово: файл «${file.name}» обработан на сервере`)
    } catch {
      setServerMessage('Не получилось обработать файл. Проверьте, что backend запущен: npm run dev:server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">AI-платформа для продавцов маркетплейсов</p>
          <h1>Стратег для маркетплейсов</h1>
          <p className="hero-text">Загружаете выгрузку из кабинета Ozon/WB — сервер анализирует продажи, рекламу, маржу, остатки и конверсии, сохраняет историю и готовит стратегию роста на месяц.</p>
          <div className="hero-actions">
            <input className="project-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Название проекта" />
            <label className="upload-button">
              {loading ? 'Анализирую…' : 'Загрузить CSV/XLSX/ODS'}
              <input type="file" accept=".csv,.xlsx,.xls,.ods" disabled={loading} onChange={(event) => onFileUpload(event.target.files?.[0] ?? null)} />
            </label>
            <span className="file-name">Источник: {analysis.fileName}</span>
          </div>
          <p className="server-message">{serverMessage}</p>
        </div>
        <aside className="strategy-card">
          <span>Стратегия месяца · {strategy.source === 'ai' ? 'AI' : 'rules'}</span>
          <strong>{strategy.headline}</strong>
          {analysis.id && (
            <div className="export-actions">
              <a href={exportUrl(analysis.id, 'xlsx')}>XLSX</a>
              <a href={exportUrl(analysis.id, 'pdf')}>PDF</a>
            </div>
          )}
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
          <div className="panel-header"><h2>ТОП товаров</h2><p>Сортировка по продажам, с маржей и рекламной эффективностью.</p></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Товар</th><th>Категория</th><th>Продажи</th><th>ДДР</th><th>Маржа</th><th>Конв. корзина→заказ</th></tr></thead>
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

        <div className="panel"><h2>Риски</h2><ul className="insight-list">{strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div>
        <div className="panel"><h2>Рекомендации на месяц</h2><ol className="action-list">{strategy.actions.map((action) => <li key={action}>{action}</li>)}</ol></div>
        <div className="panel"><h2>История анализов</h2><ul className="history-list">{latestAnalyses.map((item) => <li key={item.id}><button onClick={() => setAnalysis(item)}>{item.projectName}<small>{item.fileName}</small></button></li>)}</ul></div>
      </section>
    </main>
  )
}
