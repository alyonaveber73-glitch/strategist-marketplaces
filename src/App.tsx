import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { createCheckout, createInvite, exportUrl, fetchInvites, fetchProjects, fetchUnitEconomics, importUnitEconomics, login, logout, me, register, saveUnitEconomics, uploadAnalysis } from './lib/api'
import type { Analysis, Invite, ProductMetric, Project, Role, Strategy, Totals, UnitEconomics, User } from './types/analytics'

const demoRows: ProductMetric[] = [
  { sku: '3834285502', name: 'Молочко-тонер увлажняющий', category: 'Тоники', revenue: 146_211, orders: 151, adSpend: 16_790, margin: 46_815, impressions: 55_202, clicks: 2_946, carts: 822, stock: 84, promoRevenue: 0, costTotal: 14_929, commissionTotal: 67_950, acquiringTotal: 1_661, logisticsTotal: 0, taxTotal: 0 },
  { sku: '3866840308', name: 'BB-крем для лица', category: 'BB-крем', revenue: 127_673, orders: 133, adSpend: 25_667, margin: 21_448, impressions: 83_126, clicks: 3_110, carts: 771, stock: 62, promoRevenue: 0, costTotal: 11_559, commissionTotal: 51_804, acquiringTotal: 1_264, logisticsTotal: 0, taxTotal: 0 },
  { sku: '3834234432', name: 'Блеск для губ', category: 'Блеск', revenue: 85_354, orders: 132, adSpend: 19_460, margin: 7_614, impressions: 95_112, clicks: 3_968, carts: 1_102, stock: 36, promoRevenue: 0, costTotal: 13_303, commissionTotal: 35_178, acquiringTotal: 858, logisticsTotal: 0, taxTotal: 0 },
]

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}
function percent(value: number) { return `${(value * 100).toFixed(1)}%` }
function totals(rows: ProductMetric[]): Totals {
  return rows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue, orders: acc.orders + row.orders, adSpend: acc.adSpend + row.adSpend, margin: acc.margin + row.margin,
    impressions: acc.impressions + row.impressions, clicks: acc.clicks + row.clicks, carts: acc.carts + row.carts, stock: acc.stock + row.stock,
    promoRevenue: acc.promoRevenue + row.promoRevenue, costTotal: acc.costTotal + row.costTotal, commissionTotal: acc.commissionTotal + row.commissionTotal,
    acquiringTotal: acc.acquiringTotal + row.acquiringTotal, logisticsTotal: acc.logisticsTotal + row.logisticsTotal, taxTotal: acc.taxTotal + row.taxTotal,
  }), { revenue: 0, orders: 0, adSpend: 0, margin: 0, impressions: 0, clicks: 0, carts: 0, stock: 0, promoRevenue: 0, costTotal: 0, commissionTotal: 0, acquiringTotal: 0, logisticsTotal: 0, taxTotal: 0 })
}
function demoAnalysis(): Analysis {
  const total = totals(demoRows)
  const strategy: Strategy = { source: 'rules', headline: 'Демо: загрузите реальные отчёты, заполните юнит-экономику и получите стратегию роста.', focusProducts: demoRows, risks: ['Демо-режим без авторизации.', 'Маржа зависит от заполненной себестоимости/комиссий.', 'Остатки нужно сверять перед масштабированием.'], actions: ['Зарегистрироваться или войти.', 'Заполнить справочник юнит-экономики.', 'Загрузить отчёты продажи/реклама/остатки/акции.', 'Скачать PDF/XLSX отчёт.'] }
  return { id: '', projectId: '', fileName: 'Демо-данные', createdAt: new Date().toISOString(), reportTypes: ['unknown'], rows: demoRows, totals: total, strategy }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('Алёна')
  const [analysis, setAnalysis] = useState<Analysis>(demoAnalysis)
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<UnitEconomics[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('viewer')
  const [draftUnit, setDraftUnit] = useState({ sku: '', name: '', cost: 0, commission: 0, acquiring: 0, logistics: 0, tax: 0 })
  const [projectName, setProjectName] = useState('Новый проект Ozon')
  const [loading, setLoading] = useState(false)
  const [serverMessage, setServerMessage] = useState('Войдите, чтобы сохранять проекты и историю')

  const rows = analysis.rows
  const total = analysis.totals
  const strategy = analysis.strategy
  const ddr = total.adSpend / Math.max(total.revenue, 1)
  const marginRate = total.margin / Math.max(total.revenue, 1)
  const ctr = total.clicks / Math.max(total.impressions, 1)
  const cartConversion = total.carts / Math.max(total.clicks, 1)
  const orderConversion = total.orders / Math.max(total.carts, 1)
  const latestAnalyses = useMemo(() => projects.flatMap((project) => project.analyses.map((item) => ({ ...item, projectName: project.name }))).slice(0, 8), [projects])

  async function refresh() {
    const [loadedProjects, loadedUnits, loadedInvites] = await Promise.all([fetchProjects(), fetchUnitEconomics(), fetchInvites()])
    setProjects(loadedProjects)
    setUnits(loadedUnits)
    setInvites(loadedInvites)
    if (loadedProjects[0]?.analyses[0]) setAnalysis(loadedProjects[0].analyses[0])
  }

  useEffect(() => { me().then((current) => { if (current) { setUser(current); refresh().catch(() => null); setServerMessage('Личный кабинет подключён') } }) }, [])

  async function submitAuth() {
    try {
      const current = authMode === 'login' ? await login(email, password) : await register(email, password, name)
      setUser(current)
      setServerMessage('Готово: личный кабинет активен')
      await refresh()
    } catch (error) { setServerMessage(error instanceof Error ? error.message : 'Ошибка авторизации') }
  }

  async function onFileUpload(file: File | null) {
    if (!file || !user) return
    setLoading(true)
    setServerMessage('Загружаю файл на сервер и нормализую отчёты…')
    try {
      const result = await uploadAnalysis(file, projectName)
      setAnalysis(result.analysis)
      await refresh()
      setServerMessage(`Готово: распознаны типы отчётов — ${result.analysis.reportTypes.join(', ')}`)
    } catch { setServerMessage('Не получилось обработать файл. Проверьте backend и формат файла.') }
    finally { setLoading(false) }
  }

  async function importUnits(file: File | null) {
    if (!file || !user) return
    const result = await importUnitEconomics(file)
    setUnits(result.items)
    setServerMessage(`Импортировано SKU: ${result.imported}`)
  }

  async function addInvite() {
    if (!inviteEmail) return
    await createInvite(inviteEmail, inviteRole)
    setInviteEmail('')
    setInvites(await fetchInvites())
    setServerMessage('Приглашение создано')
  }

  async function startCheckout(plan: 'pro' | 'team') {
    const result = await createCheckout(plan)
    if (result.checkoutUrl) window.location.href = result.checkoutUrl
    else setServerMessage(result.message || `Billing demo: выбран тариф ${plan}`)
  }

  async function addUnit() {
    if (!user || !draftUnit.sku) return
    const updated = await saveUnitEconomics([draftUnit])
    setUnits(updated)
    setDraftUnit({ sku: '', name: '', cost: 0, commission: 0, acquiring: 0, logistics: 0, tax: 0 })
    setServerMessage('Справочник юнит-экономики обновлён')
  }

  return <main className="page-shell">
    <section className="hero-panel">
      <div>
        <p className="eyebrow">AI-платформа для продавцов маркетплейсов</p>
        <h1>Стратег для маркетплейсов</h1>
        <p className="hero-text">Личный кабинет продавца: загрузка отчётов Ozon/WB, нормализация продаж/рекламы/остатков/акций, юнит-экономика, AI-стратегия и экспорт в PDF/XLSX.</p>
        {!user && <div className="auth-card">
          <div className="auth-tabs"><button onClick={() => setAuthMode('register')}>Регистрация</button><button onClick={() => setAuthMode('login')}>Вход</button></div>
          {authMode === 'register' && <input className="project-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />}
          <input className="project-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input className="project-input" value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Пароль от 6 символов" />
          <button className="plain-button" onClick={submitAuth}>{authMode === 'login' ? 'Войти' : 'Создать кабинет'}</button>
        </div>}
        {user && <div className="hero-actions">
          <input className="project-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Название проекта" />
          <label className="upload-button">{loading ? 'Анализирую…' : 'Загрузить отчёты'}<input type="file" accept=".csv,.xlsx,.xls,.ods" disabled={loading} onChange={(event) => onFileUpload(event.target.files?.[0] ?? null)} /></label>
          <button className="plain-button" onClick={() => { logout(); setUser(null); setProjects([]); setUnits([]) }}>Выйти</button>
          <span className="file-name">Источник: {analysis.fileName}</span>
        </div>}
        <p className="server-message">{serverMessage}</p>
      </div>
      <aside className="strategy-card"><span>Стратегия месяца · {strategy.source === 'ai' ? 'AI' : 'rules'}</span><strong>{strategy.headline}</strong>{analysis.id && <div className="export-actions"><a href={exportUrl(analysis.id, 'xlsx')}>XLSX</a><a href={exportUrl(analysis.id, 'pdf')}>PDF</a></div>}</aside>
    </section>

    <section className="metrics-grid">
      <article><span>Продажи</span><strong>{money(total.revenue)}</strong></article><article><span>Маржа</span><strong>{money(total.margin)}</strong><small>{percent(marginRate)}</small></article><article><span>ДДР</span><strong>{percent(ddr)}</strong></article><article><span>Остатки</span><strong>{total.stock.toFixed(0)}</strong></article><article><span>Показ → клик</span><strong>{percent(ctr)}</strong></article><article><span>Клик → корзина</span><strong>{percent(cartConversion)}</strong></article><article><span>Корзина → заказ</span><strong>{percent(orderConversion)}</strong></article>
    </section>

    <section className="content-grid">
      <div className="panel wide"><div className="panel-header"><h2>ТОП товаров</h2><p>Продажи, ДДР, маржа, остатки и расходы по справочнику.</p></div><div className="table-wrap"><table><thead><tr><th>Товар</th><th>Категория</th><th>Продажи</th><th>ДДР</th><th>Маржа</th><th>Остаток</th></tr></thead><tbody>{[...rows].sort((a, b) => b.revenue - a.revenue).map((row) => <tr key={row.sku}><td><strong>{row.name}</strong><small>{row.sku}</small></td><td>{row.category}</td><td>{money(row.revenue)}</td><td>{percent(row.adSpend / Math.max(row.revenue, 1))}</td><td>{money(row.margin)}</td><td>{row.stock}</td></tr>)}</tbody></table></div></div>
      <div className="panel"><h2>Справочник юнит-экономики</h2><div className="unit-form"><input placeholder="SKU" value={draftUnit.sku} onChange={(e) => setDraftUnit({ ...draftUnit, sku: e.target.value })} /><input placeholder="Название" value={draftUnit.name} onChange={(e) => setDraftUnit({ ...draftUnit, name: e.target.value })} /><input placeholder="Себестоимость" type="number" value={draftUnit.cost} onChange={(e) => setDraftUnit({ ...draftUnit, cost: Number(e.target.value) })} /><input placeholder="Комиссия" type="number" value={draftUnit.commission} onChange={(e) => setDraftUnit({ ...draftUnit, commission: Number(e.target.value) })} /><input placeholder="Эквайринг" type="number" value={draftUnit.acquiring} onChange={(e) => setDraftUnit({ ...draftUnit, acquiring: Number(e.target.value) })} /><button onClick={addUnit}>Сохранить SKU</button><label className="mini-upload">Импорт XLSX<input type="file" accept=".csv,.xlsx,.xls,.ods" onChange={(e) => importUnits(e.target.files?.[0] ?? null)} /></label></div><small>Записей: {units.length}</small></div>
      <div className="panel"><h2>Команда</h2><div className="unit-form"><input placeholder="Email сотрудника" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}><option value="viewer">viewer</option><option value="analyst">analyst</option><option value="admin">admin</option></select><button onClick={addInvite}>Пригласить</button></div><small>Инвайтов: {invites.length}</small></div>
      <div className="panel"><h2>Тарифы</h2><div className="billing-actions"><button onClick={() => startCheckout('pro')}>Pro</button><button onClick={() => startCheckout('team')}>Team</button></div><small>Если Stripe не настроен — включается demo billing.</small></div>
      <div className="panel"><h2>Риски</h2><ul className="insight-list">{strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div>
      <div className="panel"><h2>Рекомендации на месяц</h2><ol className="action-list">{strategy.actions.map((action) => <li key={action}>{action}</li>)}</ol></div>
      <div className="panel"><h2>История анализов</h2><ul className="history-list">{latestAnalyses.map((item) => <li key={item.id}><button onClick={() => setAnalysis(item)}>{item.projectName}<small>{item.fileName} · {item.reportTypes.join(', ')}</small></button></li>)}</ul></div>
    </section>
  </main>
}
