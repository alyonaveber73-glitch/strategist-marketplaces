import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { analyzeBuffer } from './analyzer.js'
import { exportAnalysisPdf, exportAnalysisXlsx } from './exporters.js'
import { buildAiStrategy } from './strategy.js'
import { findAnalysis, readProjects, upsertAnalysis } from './storage.js'
import type { Analysis, Project } from './types.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const PORT = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.OPENAI_API_KEY) })
})

app.get('/api/projects', async (_req, res) => {
  res.json({ projects: await readProjects() })
})

app.post('/api/analyze', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'FILE_REQUIRED' })
      return
    }

    const projectId = String(req.body.projectId || randomUUID())
    const now = new Date().toISOString()
    const projectName = String(req.body.projectName || req.file.originalname.replace(/\.[^.]+$/, '') || 'Новый проект')
    const marketplace = String(req.body.marketplace || 'unknown') as Project['marketplace']
    const analyzed = analyzeBuffer(req.file.buffer, req.file.originalname)

    if (!analyzed.rows.length) {
      res.status(422).json({ error: 'NO_DATA_RECOGNIZED', sheetNames: analyzed.sheetNames })
      return
    }

    const strategy = await buildAiStrategy(analyzed.rows, analyzed.totals)
    const analysis: Analysis = {
      id: randomUUID(),
      projectId,
      fileName: req.file.originalname,
      createdAt: now,
      rows: analyzed.rows,
      totals: analyzed.totals,
      strategy,
    }

    const project: Project = {
      id: projectId,
      name: projectName,
      marketplace,
      createdAt: now,
      updatedAt: now,
      analyses: [],
    }

    const savedProject = await upsertAnalysis(project, analysis)
    res.json({ project: savedProject, analysis })
  } catch (error) {
    next(error)
  }
})

app.post('/api/strategy/:analysisId/regenerate', async (req, res, next) => {
  try {
    const found = await findAnalysis(req.params.analysisId)
    if (!found) {
      res.status(404).json({ error: 'ANALYSIS_NOT_FOUND' })
      return
    }
    found.analysis.strategy = await buildAiStrategy(found.analysis.rows, found.analysis.totals)
    const projects = await readProjects()
    const project = projects.find((item) => item.id === found.project.id)
    const analysis = project?.analyses.find((item) => item.id === found.analysis.id)
    if (analysis) analysis.strategy = found.analysis.strategy
    await fs.writeFile(path.resolve('server/data/projects.json'), JSON.stringify(projects, null, 2), 'utf8')
    res.json({ analysis: found.analysis })
  } catch (error) {
    next(error)
  }
})

app.get('/api/export/:analysisId.xlsx', async (req, res, next) => {
  try {
    const found = await findAnalysis(req.params.analysisId)
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

app.get('/api/export/:analysisId.pdf', async (req, res, next) => {
  try {
    const found = await findAnalysis(req.params.analysisId)
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
