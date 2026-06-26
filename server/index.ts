import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { analyzeBuffer } from './analyzer.js'
import { createToken, loginUser, registerUser, requireAuth } from './auth.js'
import { migrate } from './db.js'
import { exportAnalysisPdf, exportAnalysisXlsx } from './exporters.js'
import { buildAiStrategy } from './strategy.js'
import { findAnalysis, getUnitEconomicsMap, listUnitEconomics, readProjects, updateAnalysisStrategy, upsertAnalysis, upsertUnitEconomics } from './storage.js'
import type { Analysis, Project } from './types.js'

migrate()

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const PORT = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.OPENAI_API_KEY), storage: 'sqlite' })
})

app.post('/api/auth/register', (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim()
    const password = String(req.body.password || '')
    const name = String(req.body.name || email.split('@')[0] || 'User')
    if (!email || password.length < 6) {
      res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' })
      return
    }
    const user = registerUser(email, password, name)
    res.json({ user, token: createToken(user) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', (req, res) => {
  const user = loginUser(String(req.body.email || ''), String(req.body.password || ''))
  if (!user) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    return
  }
  res.json({ user, token: createToken(user) })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/projects', requireAuth, async (req, res) => {
  res.json({ projects: readProjects(req.user!.id) })
})

app.get('/api/unit-economics', requireAuth, (req, res) => {
  res.json({ items: listUnitEconomics(req.user!.id) })
})

app.post('/api/unit-economics', requireAuth, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body]
  res.json({ items: upsertUnitEconomics(req.user!.id, items) })
})

app.post('/api/analyze', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'FILE_REQUIRED' })
      return
    }

    const projectId = String(req.body.projectId || randomUUID())
    const now = new Date().toISOString()
    const projectName = String(req.body.projectName || req.file.originalname.replace(/\.[^.]+$/, '') || 'Новый проект')
    const marketplace = String(req.body.marketplace || 'unknown') as Project['marketplace']
    const analyzed = analyzeBuffer(req.file.buffer, req.file.originalname, getUnitEconomicsMap(req.user!.id))

    if (!analyzed.rows.length) {
      res.status(422).json({ error: 'NO_DATA_RECOGNIZED', sheetNames: analyzed.sheetNames, reportTypes: analyzed.reportTypes })
      return
    }

    const strategy = await buildAiStrategy(analyzed.rows, analyzed.totals)
    const analysis: Analysis = {
      id: randomUUID(),
      projectId,
      fileName: req.file.originalname,
      createdAt: now,
      reportTypes: analyzed.reportTypes,
      rows: analyzed.rows,
      totals: analyzed.totals,
      strategy,
    }

    const project: Project = {
      id: projectId,
      userId: req.user!.id,
      name: projectName,
      marketplace,
      createdAt: now,
      updatedAt: now,
      analyses: [],
    }

    const savedProject = upsertAnalysis(project, analysis)
    res.json({ project: savedProject, analysis })
  } catch (error) {
    next(error)
  }
})

app.post('/api/strategy/:analysisId/regenerate', requireAuth, async (req, res, next) => {
  try {
    const found = findAnalysis(req.user!.id, req.params.analysisId)
    if (!found) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    found.analysis.strategy = await buildAiStrategy(found.analysis.rows, found.analysis.totals)
    updateAnalysisStrategy(found.analysis)
    res.json({ analysis: found.analysis })
  } catch (error) {
    next(error)
  }
})

app.get('/api/export/:analysisId.xlsx', requireAuth, async (req, res, next) => {
  try {
    const found = findAnalysis(req.user!.id, req.params.analysisId)
    if (!found) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    const filePath = await exportAnalysisXlsx(found.analysis)
    const file = await fs.readFile(filePath)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="analysis-${found.analysis.id}.xlsx"`)
    res.send(file)
  } catch (error) {
    next(error)
  }
})

app.get('/api/export/:analysisId.pdf', requireAuth, async (req, res, next) => {
  try {
    const found = findAnalysis(req.user!.id, req.params.analysisId)
    if (!found) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    const filePath = await exportAnalysisPdf(found.analysis)
    const file = await fs.readFile(filePath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="analysis-${found.analysis.id}.pdf"`)
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
