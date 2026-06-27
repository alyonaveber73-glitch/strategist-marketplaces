import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { analyzeFiles, parseUnitEconomicsBuffer } from './analyzer.js'
import { exportAnalysisPdf, exportAnalysisXlsx } from './exporters.js'
import { buildDataQuality } from './quality.js'
import { buildAiStrategy } from './strategy.js'
import type { Analysis, UnitEconomics } from './types.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const PORT = Number(process.env.PORT || 8787)

const analyses = new Map<string, Analysis>()
let unitEconomics: UnitEconomics[] = []

function unitMap() {
  return new Map(unitEconomics.map((item) => [item.sku, item]))
}

app.use(cors())
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.OPENAI_API_KEY), storage: 'in-memory' })
})

app.get('/api/unit-economics', (_req, res) => {
  res.json({ items: unitEconomics })
})

app.post('/api/unit-economics', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body]
  const map = new Map(unitEconomics.map((item) => [item.sku, item]))
  for (const item of items) {
    if (!item.sku) continue
    map.set(String(item.sku), {
      sku: String(item.sku),
      name: String(item.name || ''),
      cost: Number(item.cost || 0),
      commission: Number(item.commission || 0),
      acquiring: Number(item.acquiring || 0),
      logistics: Number(item.logistics || 0),
      tax: Number(item.tax || 0),
    })
  }
  unitEconomics = [...map.values()]
  res.json({ items: unitEconomics })
})

app.post('/api/unit-economics/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'FILE_REQUIRED' })
    return
  }
  const imported = parseUnitEconomicsBuffer(req.file.buffer, req.file.originalname)
  const map = new Map(unitEconomics.map((item) => [item.sku, item]))
  imported.forEach((item) => map.set(item.sku, item))
  unitEconomics = [...map.values()]
  res.json({ items: unitEconomics, imported: imported.length })
})

app.post('/api/analyze', upload.array('files', 8), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files?.length) {
      res.status(400).json({ error: 'FILE_REQUIRED' })
      return
    }

    const analyzed = analyzeFiles(
      files.map((file) => ({ buffer: file.buffer, fileName: file.originalname })),
      unitMap(),
    )
    if (!analyzed.rows.length) {
      res.status(422).json({ error: 'NO_DATA_RECOGNIZED', sheetNames: analyzed.sheetNames, reportTypes: analyzed.reportTypes })
      return
    }

    const analysis: Analysis = {
      id: randomUUID(),
      fileName: files.length === 1 ? files[0].originalname : `${files.length} файлов: ${files.map((file) => file.originalname).join(', ')}`,
      createdAt: new Date().toISOString(),
      reportTypes: analyzed.reportTypes,
      rows: analyzed.rows,
      totals: analyzed.totals,
      strategy: await buildAiStrategy(analyzed.rows, analyzed.totals),
      quality: buildDataQuality(analyzed.rows, analyzed.totals, analyzed.reportTypes),
    }
    analyses.set(analysis.id, analysis)
    res.json({ analysis })
  } catch (error) {
    next(error)
  }
})

app.get('/api/analyses', (_req, res) => {
  res.json({ analyses: [...analyses.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20) })
})

app.get('/api/export/:analysisId.xlsx', async (req, res, next) => {
  try {
    const analysis = analyses.get(req.params.analysisId)
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
    const analysis = analyses.get(req.params.analysisId)
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  res.status(500).json({ error: 'SERVER_ERROR' })
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
