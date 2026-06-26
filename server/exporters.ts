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
      ['Типы отчётов', analysis.reportTypes.join(', ')],
      ['Продажи', totals.revenue],
      ['Заказы', totals.orders],
      ['Реклама', totals.adSpend],
      ['ДДР', totals.adSpend / Math.max(totals.revenue, 1)],
      ['Себестоимость', totals.costTotal],
      ['Комиссия', totals.commissionTotal],
      ['Эквайринг', totals.acquiringTotal],
      ['Логистика', totals.logisticsTotal],
      ['Налоги', totals.taxTotal],
      ['Маржа', totals.margin],
      ['Маржа %', totals.margin / Math.max(totals.revenue, 1)],
      ['Остатки', totals.stock],
      ['Акции/промо', totals.promoRevenue],
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
        Себестоимость: row.costTotal,
        Комиссия: row.commissionTotal,
        Эквайринг: row.acquiringTotal,
        Логистика: row.logisticsTotal,
        Налоги: row.taxTotal,
        Маржа: row.margin,
        'Маржа %': row.margin / Math.max(row.revenue, 1),
        Остатки: row.stock,
        Акции: row.promoRevenue,
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
    const doc = new PDFDocument({ margin: 44, size: 'A4' })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    doc.rect(0, 0, doc.page.width, 128).fill('#182033')
    doc.fillColor('#FFC887').fontSize(11).text('СТРАТЕГ ДЛЯ МАРКЕТПЛЕЙСОВ', 44, 34, { characterSpacing: 1 })
    doc.fillColor('#FFFFFF').fontSize(24).text('Отчёт по продажам и стратегии роста', 44, 58, { width: 500 })
    doc.fontSize(10).fillColor('#D9EAF7').text(`Файл: ${analysis.fileName} · ${new Date(analysis.createdAt).toLocaleString('ru-RU')}`, 44, 94)

    doc.y = 154
    doc.fillColor('#182033').fontSize(15).text('Итоговые метрики')
    const cards = [
      ['Продажи', money(analysis.totals.revenue)],
      ['Маржа', `${money(analysis.totals.margin)} / ${pct(analysis.totals.margin / Math.max(analysis.totals.revenue, 1))}`],
      ['ДДР', pct(analysis.totals.adSpend / Math.max(analysis.totals.revenue, 1))],
      ['Остатки', String(analysis.totals.stock)],
      ['Себестоимость+комиссии', money(analysis.totals.costTotal + analysis.totals.commissionTotal + analysis.totals.acquiringTotal + analysis.totals.logisticsTotal + analysis.totals.taxTotal)],
      ['Типы отчётов', analysis.reportTypes.join(', ')],
    ]
    let x = 44
    let y = doc.y + 14
    cards.forEach(([label, value], index) => {
      if (index === 3) {
        x = 44
        y += 72
      }
      doc.roundedRect(x, y, 158, 54, 10).fill('#FFF7EA')
      doc.fillColor('#9A5B21').fontSize(8).text(label, x + 12, y + 10, { width: 134 })
      doc.fillColor('#182033').fontSize(12).text(value, x + 12, y + 26, { width: 134 })
      x += 172
    })

    doc.y = y + 88
    doc.fillColor('#182033').fontSize(15).text('Стратегия месяца')
    doc.moveDown(0.3).fontSize(12).fillColor('#38405D').text(analysis.strategy.headline, { lineGap: 3 })

    doc.moveDown().fillColor('#182033').fontSize(14).text('Риски')
    analysis.strategy.risks.forEach((item) => doc.fontSize(10).fillColor('#414B63').text(`• ${item}`, { lineGap: 2 }))

    doc.moveDown().fillColor('#182033').fontSize(14).text('Действия на месяц')
    analysis.strategy.actions.forEach((item, index) => doc.fontSize(10).fillColor('#414B63').text(`${index + 1}. ${item}`, { lineGap: 2 }))

    doc.addPage()
    doc.fillColor('#182033').fontSize(18).text('ТОП товаров')
    analysis.rows
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15)
      .forEach((row, index) => {
        doc.moveDown(0.35)
        doc.fontSize(10).fillColor('#182033').text(`${index + 1}. ${row.name}`)
        doc.fontSize(9).fillColor('#6D7485').text(
          `SKU ${row.sku} · продажи ${money(row.revenue)} · маржа ${money(row.margin)} · ДДР ${pct(row.adSpend / Math.max(row.revenue, 1))} · остаток ${row.stock}`,
        )
      })

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return filePath
}
