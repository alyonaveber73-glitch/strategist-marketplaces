import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import * as XLSX from 'xlsx'
import type { Analysis } from './types.js'

const EXPORT_DIR = path.resolve('server/exports')

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽'
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

async function ensureExportDir() {
  await fsPromises.mkdir(EXPORT_DIR, { recursive: true })
}

export async function exportAnalysisXlsx(analysis: Analysis) {
  await ensureExportDir()
  const filePath = path.join(EXPORT_DIR, `${analysis.id}.xlsx`)
  const workbook = XLSX.utils.book_new()
  const totals = analysis.totals

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Метрика', 'Значение'],
      ['Продажи', totals.revenue],
      ['Заказы', totals.orders],
      ['Реклама', totals.adSpend],
      ['ДДР', totals.adSpend / Math.max(totals.revenue, 1)],
      ['Маржа', totals.margin],
      ['Маржа %', totals.margin / Math.max(totals.revenue, 1)],
      ['Показы', totals.impressions],
      ['Клики', totals.clicks],
      ['Корзины', totals.carts],
    ]),
    'Итог',
  )

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      analysis.rows.map((row) => ({
        SKU: row.sku,
        Товар: row.name,
        Категория: row.category,
        Продажи: row.revenue,
        Заказы: row.orders,
        Реклама: row.adSpend,
        ДДР: row.adSpend / Math.max(row.revenue, 1),
        Маржа: row.margin,
        'Маржа %': row.margin / Math.max(row.revenue, 1),
        Показы: row.impressions,
        Клики: row.clicks,
        Корзины: row.carts,
      })),
    ),
    'Товары',
  )

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Стратегия', analysis.strategy.headline],
      [],
      ['Риски'],
      ...analysis.strategy.risks.map((item) => [item]),
      [],
      ['Действия'],
      ...analysis.strategy.actions.map((item, index) => [`${index + 1}. ${item}`]),
    ]),
    'Стратегия',
  )

  XLSX.writeFile(workbook, filePath)
  return filePath
}

export async function exportAnalysisPdf(analysis: Analysis) {
  await ensureExportDir()
  const filePath = path.join(EXPORT_DIR, `${analysis.id}.pdf`)

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    doc.fontSize(22).text('Отчёт: Стратег для маркетплейсов')
    doc.moveDown(0.5).fontSize(11).fillColor('#666').text(`Файл: ${analysis.fileName}`)
    doc.text(`Дата анализа: ${new Date(analysis.createdAt).toLocaleString('ru-RU')}`)
    doc.moveDown().fillColor('#000')

    doc.fontSize(15).text('Итоговые метрики')
    doc.fontSize(11)
    doc.text(`Продажи: ${money(analysis.totals.revenue)}`)
    doc.text(`Заказы: ${analysis.totals.orders}`)
    doc.text(`Реклама: ${money(analysis.totals.adSpend)}`)
    doc.text(`ДДР: ${pct(analysis.totals.adSpend / Math.max(analysis.totals.revenue, 1))}`)
    doc.text(`Маржа: ${money(analysis.totals.margin)}`)
    doc.text(`Маржа %: ${pct(analysis.totals.margin / Math.max(analysis.totals.revenue, 1))}`)

    doc.moveDown().fontSize(15).text('Стратегия')
    doc.fontSize(12).text(analysis.strategy.headline)

    doc.moveDown().fontSize(14).text('Риски')
    analysis.strategy.risks.forEach((item) => doc.fontSize(11).text(`• ${item}`))

    doc.moveDown().fontSize(14).text('Действия на месяц')
    analysis.strategy.actions.forEach((item, index) => doc.fontSize(11).text(`${index + 1}. ${item}`))

    doc.moveDown().fontSize(14).text('ТОП товаров')
    analysis.rows
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .forEach((row, index) => {
        doc.fontSize(10).text(`${index + 1}. ${row.name} — ${money(row.revenue)}, маржа ${money(row.margin)}`)
      })

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return filePath
}
