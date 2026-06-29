import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { exportUrl, fetchAnalyses, fetchUnitEconomics, importUnitEconomics, saveUnitEconomics, uploadAnalysis } from './lib/api'
import type { Analysis, ProductMetric, ReportType, Strategy, Totals, UnitEconomics } from './types/analytics'

const demoRows: ProductMetric[] = [
  { sku: '3834285502', name: 'Молочко-тонер увлажняющий', category: 'Тоники', revenue: 146_211, orders: 151, adSpend: 16_790, margin: 46_815, impressions: 55_202, clicks: 2_946, carts: 822, stock: 84, promoRevenue: 0, costTotal: 14_929, commissionTotal: 67_950, acquiringTotal: 1_661, logisticsTotal: 0, taxTotal: 0 },
  { sku: '3866840308', name: 'BB-крем для лица', category: 'BB-крем', revenue: 127_673, orders: 133, adSpend: 25_667, margin: 21_448, impressions: 83_126, clicks: 3_110, carts: 771, stock: 62, promoRevenue: 0, costTotal: 11_559, commissionTotal: 51_804, acquiringTotal: 1_264, logisticsTotal: 0, taxTotal: 0 },
  { sku: '3834234432', name: 'Блеск для губ', category: 'Блеск', revenue: 85_354, orders: 132, adSpend: 19_460, margin: 7_614, impressions: 95_112, clicks: 3_968, carts: 1_102, stock: 36, promoRevenue: 0, costTotal: 13_303, commissionTotal: 35_178, acquiringTotal: 858, logisticsTotal: 0, taxTotal: 0 },
]

function money(value: number) { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value) }
function percent(value: number) { return `${(value * 100).toFixed(1)}%` }
function formatUnits(value: number) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) }
const reportTypeLabels: Record<ReportType, string> = { sales: 'Продажи', ads: 'Реклама', stocks: 'Остатки', promotions: 'Акции/промо', unknown: 'Не распознано' }
function reportTypesLabel(types: ReportType[]) { return types.map((type) => reportTypeLabels[type] ?? type).join(', ') }
function buildMetricInsights(total: Totals, reportTypes: ReportType[]) {
  const loaded = new Set(reportTypes)
  const costs = total.costTotal + total.commissionTotal + total.acquiringTotal + total.logisticsTotal + total.taxTotal
  const insights: string[] = []

  if (total.revenue > 0) insights.push(`Продажи составили ${money(total.revenue)} при ${formatUnits(total.orders)} заказах.`)
  else insights.push('Продажи не найдены — загрузите отчёт продаж или проверьте распознавание колонок.')

  if (total.stock > 0) insights.push(`Остатки: ${formatUnits(total.stock)} шт. Значение округлено для удобного чтения.`)
  else insights.push('Остатки не найдены — без них нельзя оценить риск out-of-stock.')

  if (!loaded.has('ads') || total.adSpend === 0) insights.push('ДРР равен 0%, потому что рекламные расходы не загружены или равны нулю.')
  else insights.push(`ДРР: ${percent(total.adSpend / Math.max(total.revenue, 1))}.`)

  if (costs === 0 && total.revenue > 0) insights.push('Себестоимость + комиссии равны 0 ₽ — маржа не рассчитана. Нужно загрузить или заполнить справочник юнит-экономики.')
  else insights.push(`Себестоимость + комиссии: ${money(costs)}.`)

  if (total.margin === 0 && total.revenue > 0) insights.push('Маржа сейчас 0 ₽: это сигнал, что не хватает расходов/комиссий/себестоимости для корректного расчёта.')
  else insights.push(`Маржа: ${money(total.margin)} / ${percent(total.margin / Math.max(total.revenue, 1))}.`)

  if (loaded.has('unknown')) insights.push('Есть нераспознанные листы — часть данных может не участвовать в расчётах.')

  return insights
}
function totals(rows: ProductMetric[]): Totals {
  return rows.reduce((acc, row) => ({ revenue: acc.revenue + row.revenue, orders: acc.orders + row.orders, adSpend: acc.adSpend + row.adSpend, margin: acc.margin + row.margin, impressions: acc.impressions + row.impressions, clicks: acc.clicks + row.clicks, carts: acc.carts + row.carts, stock: acc.stock + row.stock, promoRevenue: acc.promoRevenue + row.promoRevenue, costTotal: acc.costTotal + row.costTotal, commissionTotal: acc.commissionTotal + row.commissionTotal, acquiringTotal: acc.acquiringTotal + row.acquiringTotal, logisticsTotal: acc.logisticsTotal + row.logisticsTotal, taxTotal: acc.taxTotal + row.taxTotal }), { revenue: 0, orders: 0, adSpend: 0, margin: 0, impressions: 0, clicks: 0, carts: 0, stock: 0, promoRevenue: 0, costTotal: 0, commissionTotal: 0, acquiringTotal: 0, logisticsTotal: 0, taxTotal: 0 })
}
function demoAnalysis(): Analysis {
  const total = totals(demoRows)
  const strategy: Strategy = { source: 'rules', headline: 'Простой MVP: загрузите отчёты, получите анализ, стратегию и экспорт без регистрации, оплаты и базы данных.', focusProducts: demoRows, risks: ['Данные хранятся только в памяти запущенного сервера.', 'Для точной маржи заполните справочник юнит-экономики.', 'Перед масштабированием проверьте остатки лидеров.'], actions: ['Загрузить справочник себестоимости XLSX/CSV.', 'Загрузить отчёты Ozon/WB.', 'Скачать PDF или XLSX отчёт.', 'Повторять анализ раз в неделю.'] }
  return { id: '', fileName: 'Демо-данные', createdAt: new Date().toISOString(), reportTypes: ['unknown'], rows: demoRows, totals: total, strategy, quality: { score: 72, recognizedReports: ['sales', 'ads', 'stocks'], missingReports: ['promotions'], warnings: ['Демо-режим: реальные файлы ещё не загружены.', 'Для точной маржи заполните справочник юнит-экономики.'], suggestions: ['Загрузите продажи, рекламу и остатки одной пачкой.', 'Импортируйте справочник юнит-экономики по SKU.'] } }
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>(demoAnalysis)
  const [history, setHistory] = useState<Analysis[]>([])
  const [units, setUnits] = useState<UnitEconomics[]>([])
  const [draftUnit, setDraftUnit] = useState<UnitEconomics>({ sku: '', name: '', cost: 0, commission: 0, acquiring: 0, logistics: 0, tax: 0 })
  const [loading, setLoading] = useState(false)
  const [serverMessage, setServerMessage] = useState('Простой режим: без оплаты, регистрации и базы данных')

  const rows = analysis.rows
  const total = analysis.totals
  const strategy = analysis.strategy
  const quality = analysis.quality
  const ddr = total.adSpend / Math.max(total.revenue, 1)
  const marginRate = total.margin / Math.max(total.revenue, 1)
  const ctr = total.clicks / Math.max(total.impressions, 1)
  const cartConversion = total.carts / Math.max(total.clicks, 1)
  const orderConversion = total.orders / Math.max(total.carts, 1)
  const latestAnalyses = useMemo(() => history.slice(0, 8), [history])
  const metricInsights = useMemo(() => buildMetricInsights(total, analysis.reportTypes), [total, analysis.reportTypes])

  async function refresh() {
    const [loadedHistory, loadedUnits] = await Promise.all([fetchAnalyses(), fetchUnitEconomics()])
    setHistory(loadedHistory)
    setUnits(loadedUnits)
  }

  useEffect(() => { refresh().catch(() => setServerMessage('Backend не запущен — показываю демо')) }, [])

  async function onFileUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    setLoading(true)
    setServerMessage(files.length === 1 ? 'Загружаю файл и нормализую отчёт…' : `Загружаю ${files.length} файлов и собираю единый анализ…`)
    try {
      const result = await uploadAnalysis(files)
      setAnalysis(result.analysis)
      await refresh()
      setServerMessage(`Готово: ${files.length} файл(ов), типы отчётов — ${reportTypesLabel(result.analysis.reportTypes)}`)
    } catch { setServerMessage('Не получилось обработать файл. Проверьте backend и формат файла.') }
    finally { setLoading(false) }
  }

  async function importUnits(file: File | null) {
    if (!file) return
    const result = await importUnitEconomics(file)
    setUnits(result.items)
    setServerMessage(`Импортировано SKU: ${result.imported}`)
  }

  async function addUnit() {
    if (!draftUnit.sku) return
    const updated = await saveUnitEconomics([draftUnit])
    setUnits(updated)
    setDraftUnit({ sku: '', name: '', cost: 0, commission: 0, acquiring: 0, logistics: 0, tax: 0 })
    setServerMessage('Справочник юнит-экономики обновлён')
  }

  return <main className="page-shell">
    <section className="hero-panel"><div><p className="eyebrow">AI-платформа для продавцов маркетплейсов</p><h1>Стратег для маркетплейсов</h1><p className="hero-text">Простой рабочий MVP: без регистрации, оплаты и базы данных. Загружаете один или несколько отчётов Ozon/WB, система объединяет продажи, рекламу, остатки и акции, считает маржу и готовит стратегию.</p><div className="hero-actions"><label className="upload-button">{loading ? 'Анализирую…' : 'Загрузить отчёты'}<input type="file" multiple accept=".csv,.xlsx,.xls,.ods" disabled={loading} onChange={(event) => onFileUpload(event.target.files)} /></label><span className="file-name">Источник: {analysis.fileName}</span></div><p className="server-message">{serverMessage}</p><div className="upload-hint"><strong>Можно загрузить пачкой:</strong><span>продажи + реклама + остатки + акции. Файлы объединятся в один отчёт по SKU.</span></div></div><aside className="strategy-card"><span>Стратегия месяца · {strategy.source === 'ai' ? 'AI' : 'rules'}</span><strong>{strategy.headline}</strong>{analysis.id && <div className="export-actions"><a href={exportUrl(analysis.id, 'xlsx')}>XLSX</a><a href={exportUrl(analysis.id, 'pdf')}>PDF</a></div>}</aside></section>
    <section className="metrics-grid"><article><span>Продажи</span><strong>{money(total.revenue)}</strong></article><article><span>Маржа</span><strong>{money(total.margin)}</strong><small>{percent(marginRate)}</small></article><article><span>ДДР</span><strong>{percent(ddr)}</strong></article><article><span>Остатки</span><strong>{formatUnits(total.stock)}</strong></article><article><span>Себестоимость+комиссии</span><strong>{money(total.costTotal + total.commissionTotal + total.acquiringTotal + total.logisticsTotal + total.taxTotal)}</strong></article><article><span>Типы отчётов</span><strong>{reportTypesLabel(analysis.reportTypes)}</strong></article><article><span>Показ → клик</span><strong>{percent(ctr)}</strong></article><article><span>Клик → корзина</span><strong>{percent(cartConversion)}</strong></article><article><span>Корзина → заказ</span><strong>{percent(orderConversion)}</strong></article></section>
    <section className="panel metric-analysis-panel"><div className="panel-header"><h2>Анализ метрик</h2><p>Автоматические выводы по карточкам выше: что уже видно и каких данных не хватает.</p></div><ul className="insight-list">{metricInsights.map((insight) => <li key={insight}>{insight}</li>)}</ul></section>
    <section className="content-grid"><div className="panel quality-panel"><div className="panel-header"><h2>Качество данных</h2><p>Проверка перед стратегией: что распознано и чего не хватает.</p></div><div className="quality-score"><strong>{quality.score}</strong><span>/100</span></div><div className="quality-tags"><span>Найдено: {quality.recognizedReports.length ? reportTypesLabel(quality.recognizedReports) : 'нет'}</span><span>Не хватает: {quality.missingReports.length ? reportTypesLabel(quality.missingReports) : 'нет'}</span></div><ul className="insight-list">{quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{quality.suggestions.length > 0 && <ol className="action-list quality-actions">{quality.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ol>}</div><div className="panel wide"><div className="panel-header"><h2>ТОП товаров</h2><p>Продажи, ДДР, маржа, остатки и расходы по справочнику.</p></div><div className="table-wrap"><table><thead><tr><th>Товар</th><th>Категория</th><th>Продажи</th><th>ДДР</th><th>Маржа</th><th>Остаток</th></tr></thead><tbody>{[...rows].sort((a, b) => b.revenue - a.revenue).map((row) => <tr key={row.sku}><td><strong>{row.name}</strong><small>{row.sku}</small></td><td>{row.category}</td><td>{money(row.revenue)}</td><td>{percent(row.adSpend / Math.max(row.revenue, 1))}</td><td>{money(row.margin)}</td><td>{formatUnits(row.stock)}</td></tr>)}</tbody></table></div></div><div className="panel"><h2>Справочник юнит-экономики</h2><div className="unit-form"><input placeholder="SKU" value={draftUnit.sku} onChange={(e) => setDraftUnit({ ...draftUnit, sku: e.target.value })} /><input placeholder="Название" value={draftUnit.name} onChange={(e) => setDraftUnit({ ...draftUnit, name: e.target.value })} /><input placeholder="Себестоимость" type="number" value={draftUnit.cost} onChange={(e) => setDraftUnit({ ...draftUnit, cost: Number(e.target.value) })} /><input placeholder="Комиссия" type="number" value={draftUnit.commission} onChange={(e) => setDraftUnit({ ...draftUnit, commission: Number(e.target.value) })} /><input placeholder="Эквайринг" type="number" value={draftUnit.acquiring} onChange={(e) => setDraftUnit({ ...draftUnit, acquiring: Number(e.target.value) })} /><button onClick={addUnit}>Сохранить SKU</button><label className="mini-upload">Импорт XLSX<input type="file" accept=".csv,.xlsx,.xls,.ods" onChange={(e) => importUnits(e.target.files?.[0] ?? null)} /></label></div><small>Записей: {units.length}</small></div><div className="panel"><h2>Риски</h2><ul className="insight-list">{strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div><div className="panel"><h2>Рекомендации на месяц</h2><ol className="action-list">{strategy.actions.map((action) => <li key={action}>{action}</li>)}</ol></div><div className="panel"><h2>История в памяти сервера</h2><ul className="history-list">{latestAnalyses.map((item) => <li key={item.id}><button onClick={() => setAnalysis(item)}>{item.fileName}<small>{reportTypesLabel(item.reportTypes)}</small></button></li>)}</ul></div></section>
  </main>
}
