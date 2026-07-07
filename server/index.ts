import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { analyzeFiles, parseUnitEconomicsBuffer } from './analyzer.js'
import { exportAnalysisPdf, exportAnalysisXlsx } from './exporters.js'
import { buildDataQuality } from './quality.js'
import { buildAiStrategy, buildImageAiStrategy } from './strategy.js'
import { optionalAuth, requireAuth } from './auth.js'
import { authenticateUser, createSession, createUser, deleteSession, getAnalysis, listAnalyses, listPayments, listUnitEconomics, saveAnalysis, savePayment, storageEngine, upsertUnitEconomics } from './db.js'
import { createYooKassaPayment, isPlanKey, plans } from './payments.js'
import { fetchOzonConversions } from './ozon.js'
import type { Analysis } from './types.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const PORT = Number(process.env.PORT || 8787)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../dist')
const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.ods']
const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

async function unitMap() {
  const units = await listUnitEconomics()
  return new Map(units.map((item) => [item.sku, item]))
}

function isSupportedSpreadsheet(fileName: string) {
  return SUPPORTED_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension))
}

function isSupportedImage(file: Express.Multer.File) {
  return SUPPORTED_IMAGE_MIME_TYPES.includes(file.mimetype)
}

function decodeUploadFileName(fileName: string) {
  if (!/[ÃÐÑ]/.test(fileName)) return fileName
  try {
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8')
    return decoded.includes('�') ? fileName : decoded
  } catch {
    return fileName
  }
}

app.use(cors())
app.use(express.json({ limit: '5mb' }))

app.use(express.static(distPath, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  },
}))

app.use(optionalAuth)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.OPENAI_API_KEY), storage: storageEngine(), payments: Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) })
})

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '')
    const password = String(req.body.password || '')
    const name = String(req.body.name || '')
    if (!email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'INVALID_AUTH_DATA', message: 'Укажите email и пароль от 6 символов.' })
      return
    }
    const user = await createUser(email, password, name)
    if (!user) throw new Error('USER_NOT_CREATED')
    const session = await createSession(user.id)
    res.json({ user, token: session.token, expiresAt: session.expiresAt })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Аккаунт с таким email уже есть.' })
      return
    }
    next(error)
  }
})

app.post('/api/auth/login', async (req, res) => {
  const user = await authenticateUser(String(req.body.email || ''), String(req.body.password || ''))
  if (!user) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль.' })
    return
  }
  const session = await createSession(user.id)
  res.json({ user, token: session.token, expiresAt: session.expiresAt })
})

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  if (req.authToken) await deleteSession(req.authToken)
  res.json({ ok: true })
})

app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ user: req.user, payments: await listPayments(req.user!.id) })
})

app.get('/api/plans', (_req, res) => {
  res.json({ plans })
})

app.get('/api/ozon/conversions', async (_req, res, next) => {
  try {
    res.json(await fetchOzonConversions())
  } catch (error) {
    if (error instanceof Error && error.name === 'OZON_KEYS_MISSING') {
      res.status(400).json({ error: 'OZON_KEYS_MISSING', message: error.message })
      return
    }
    next(error)
  }
})

app.post('/api/payments/yookassa', requireAuth, async (req, res, next) => {
  try {
    const plan = String(req.body.plan || '')
    if (!isPlanKey(plan)) {
      res.status(400).json({ error: 'INVALID_PLAN', message: 'Выберите тариф.' })
      return
    }
    const returnUrl = String(req.body.returnUrl || process.env.PUBLIC_URL || 'http://strateg-marketplaces.ru/')
    const payment = await createYooKassaPayment({ plan, userId: req.user!.id, email: req.user!.email, returnUrl })
    const savedPayment = { id: payment.id, userId: req.user!.id, plan, amount: payment.amount, status: payment.status, confirmationUrl: payment.confirmationUrl, createdAt: new Date().toISOString() }
    await savePayment(savedPayment, payment.raw)
    res.json({ payment: savedPayment })
  } catch (error) {
    next(error)
  }
})

app.get('/api/unit-economics', async (_req, res) => {
  res.json({ items: await listUnitEconomics() })
})

app.post('/api/unit-economics', async (req, res) => {
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [req.body]
  const items = rawItems.map((item) => ({
    sku: String(item.sku || ''),
    name: String(item.name || ''),
    cost: Number(item.cost || 0),
    commission: Number(item.commission || 0),
    acquiring: Number(item.acquiring || 0),
    logistics: Number(item.logistics || 0),
    tax: Number(item.tax || 0),
  }))
  res.json({ items: await upsertUnitEconomics(items) })
})

app.post('/api/unit-economics/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'FILE_REQUIRED' })
    return
  }
  const imported = parseUnitEconomicsBuffer(req.file.buffer, req.file.originalname)
  res.json({ items: await upsertUnitEconomics(imported), imported: imported.length })
})


app.post('/api/analyze-image', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'FILE_REQUIRED', message: 'Загрузите PNG, JPG или WEBP изображение.' })
      return
    }

    const fileName = decodeUploadFileName(req.file.originalname)
    if (!isSupportedImage(req.file)) {
      res.status(400).json({ error: 'UNSUPPORTED_FILE_TYPE', message: 'Для анализа изображения загрузите PNG, JPG или WEBP.' })
      return
    }

    const imageStrategy = await buildImageAiStrategy({ buffer: req.file.buffer, fileName, mimeType: req.file.mimetype })
    const analysis: Analysis = {
      id: randomUUID(),
      fileName,
      createdAt: new Date().toISOString(),
      reportTypes: ['unknown'],
      rows: [],
      totals: {
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
      strategy: { ...imageStrategy, focusProducts: [] },
      quality: {
        score: imageStrategy.source === 'ai' ? 70 : 20,
        recognizedReports: ['unknown'],
        missingReports: ['sales', 'ads', 'stocks'],
        warnings: ['Данные получены со скриншота: точность зависит от качества изображения. Для расчётов лучше загрузить исходные таблицы.'],
        suggestions: ['Для точных продаж, маржи и ДДР загрузите CSV/XLSX/XLS/ODS отчёты.', 'Скриншоты используйте для быстрого визуального разбора и пояснений.'],
      },
    }
    await saveAnalysis(analysis)
    res.json({ analysis })
  } catch (error) {
    next(error)
  }
})

app.post('/api/analyze', upload.array('files', 8), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files?.length) {
      res.status(400).json({ error: 'FILE_REQUIRED' })
      return
    }

    const normalizedFiles = files.map((file) => ({ ...file, originalname: decodeUploadFileName(file.originalname) }))
    const unsupportedFiles = normalizedFiles.filter((file) => !isSupportedSpreadsheet(file.originalname))
    if (unsupportedFiles.length) {
      res.status(400).json({
        error: 'UNSUPPORTED_FILE_TYPE',
        message: `Загрузите таблицы CSV, XLSX, XLS или ODS. Не поддерживаются: ${unsupportedFiles.map((file) => file.originalname).join(', ')}`,
      })
      return
    }

    const analyzed = analyzeFiles(
      normalizedFiles.map((file) => ({ buffer: file.buffer, fileName: file.originalname })),
      await unitMap(),
    )
    if (!analyzed.rows.length) {
      res.status(422).json({ error: 'NO_DATA_RECOGNIZED', sheetNames: analyzed.sheetNames, reportTypes: analyzed.reportTypes })
      return
    }

    const analysis: Analysis = {
      id: randomUUID(),
      fileName:
        normalizedFiles.length === 1
          ? normalizedFiles[0].originalname
          : `${normalizedFiles.length} файлов: ${normalizedFiles.map((file) => file.originalname).join(', ')}`,
      createdAt: new Date().toISOString(),
      reportTypes: analyzed.reportTypes,
      rows: analyzed.rows,
      totals: analyzed.totals,
      strategy: await buildAiStrategy(analyzed.rows, analyzed.totals),
      quality: buildDataQuality(analyzed.rows, analyzed.totals, analyzed.reportTypes),
    }
    await saveAnalysis(analysis)
    res.json({ analysis })
  } catch (error) {
    next(error)
  }
})

app.get('/api/analyses', async (_req, res) => {
  res.json({ analyses: await listAnalyses(20) })
})

app.get('/api/export/:analysisId.xlsx', async (req, res, next) => {
  try {
    const analysis = await getAnalysis(req.params.analysisId)
    if (!analysis) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    const filePath = await exportAnalysisXlsx(analysis)
    const file = await fs.readFile(filePath)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="analysis-${analysis.id}.xlsx"`)
    res.send(file)
  } catch (error) {
    next(error)
  }
})

app.get('/api/export/:analysisId.pdf', async (req, res, next) => {
  try {
    const analysis = await getAnalysis(req.params.analysisId)
    if (!analysis) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    const filePath = await exportAnalysisPdf(analysis)
    const file = await fs.readFile(filePath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="analysis-${analysis.id}.pdf"`)
    res.send(file)
  } catch (error) {
    next(error)
  }
})

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'SERVER_ERROR' })
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
