import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import * as XLSX from 'xlsx'
import type { Analysis } from './types.js'

const EXPORT_DIR = path.resolve('server/exports')
const FONT_REGULAR = path.resolve('server/assets/fonts/NotoSans-Regular.ttf')
const FONT_BOLD = path.resolve('server/assets/fonts/NotoSans-Bold.ttf')

function money(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽'
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function units(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
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
      ['Продажи', Math.round(totals.revenue)],
      ['Заказы', Math.round(totals.orders)],
      ['Реклама', Math.round(totals.adSpend)],
      ['ДДР', Number((totals.adSpend / Math.max(totals.revenue, 1)).toFixed(4))],
      ['Себестоимость', Math.round(totals.costTotal)],
      ['Комиссия', Math.round(totals.commissionTotal)],
      ['Эквайринг', Math.round(totals.acquiringTotal)],
      ['Логистика', Math.round(totals.logisticsTotal)],
      ['Налоги', Math.round(totals.taxTotal)],
      ['Маржа', Math.round(totals.margin)],
      ['Маржа %', Number((totals.margin / Math.max(totals.revenue, 1)).toFixed(4))],
      ['Остатки', Math.round(totals.stock)],
      ['Акции/промо', Math.round(totals.promoRevenue)],
      ['Показы', Math.round(totals.impressions)],
      ['Клики', Math.round(totals.clicks)],
      ['Корзины', Math.round(totals.carts)],
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
        Продажи: Math.round(row.revenue),
        Заказы: Math.round(row.orders),
        Реклама: Math.round(row.adSpend),
        ДДР: Number((row.adSpend / Math.max(row.revenue, 1)).toFixed(4)),
        Себестоимость: Math.round(row.costTotal),
        Комиссия: Math.round(row.commissionTotal),
        Эквайринг: Math.round(row.acquiringTotal),
        Логистика: Math.round(row.logisticsTotal),
        Налоги: Math.round(row.taxTotal),
        Маржа: Math.round(row.margin),
        'Маржа %': Number((row.margin / Math.max(row.revenue, 1)).toFixed(4)),
        Остатки: Math.round(row.stock),
        Акции: Math.round(row.promoRevenue),
        Показы: Math.round(row.impressions),
        Клики: Math.round(row.clicks),
        Корзины: Math.round(row.carts),
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
    doc.registerFont('NotoSans', FONT_REGULAR)
    doc.registerFont('NotoSansBold', FONT_BOLD)
    doc.font('NotoSans')

    doc.rect(0, 0, doc.page.width, 128).fill('#182033')
    doc.font('NotoSansBold').fillColor('#FFC887').fontSize(11).text('СТРАТЕГ ДЛЯ МАРКЕТПЛЕЙСОВ', 44, 34, { characterSpacing: 1 })
    doc.fillColor('#FFFFFF').fontSize(24).text('Отчёт по продажам и стратегии роста', 44, 58, { width: 500 })
    doc.font('NotoSans')
    doc.fontSize(10).fillColor('#D9EAF7').text(`Файл: ${analysis.fileName} · ${new Date(analysis.createdAt).toLocaleString('ru-RU')}`, 44, 94)

    doc.y = 154
    doc.font('NotoSansBold').fillColor('#182033').fontSize(15).text('Итоговые метрики')
    doc.font('NotoSans')
    const cards = [
      ['Продажи', money(analysis.totals.revenue)],
      ['Маржа', `${money(analysis.totals.margin)} / ${pct(analysis.totals.margin / Math.max(analysis.totals.revenue, 1))}`],
      ['ДДР', pct(analysis.totals.adSpend / Math.max(analysis.totals.revenue, 1))],
      ['Остатки', units(analysis.totals.stock)],
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
      doc.font('NotoSans').fillColor('#9A5B21').fontSize(8).text(label, x + 12, y + 10, { width: 134 })
      doc.font('NotoSansBold').fillColor('#182033').fontSize(12).text(value, x + 12, y + 26, { width: 134 })
      x += 172
    })

    doc.y = y + 88
    doc.font('NotoSansBold').fillColor('#182033').fontSize(15).text('Стратегия месяца')
    doc.moveDown(0.3).font('NotoSans').fontSize(12).fillColor('#38405D').text(analysis.strategy.headline, { lineGap: 3 })

    doc.moveDown().font('NotoSansBold').fillColor('#182033').fontSize(14).text('Риски')
    analysis.strategy.risks.forEach((item) => doc.font('NotoSans').fontSize(10).fillColor('#414B63').text(`• ${item}`, { lineGap: 2 }))

    doc.moveDown().font('NotoSansBold').fillColor('#182033').fontSize(14).text('Действия на месяц')
    analysis.strategy.actions.forEach((item, index) => doc.font('NotoSans').fontSize(10).fillColor('#414B63').text(`${index + 1}. ${item}`, { lineGap: 2 }))

    doc.addPage()
    doc.font('NotoSansBold').fillColor('#182033').fontSize(18).text('ТОП товаров')
    analysis.rows
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15)
      .forEach((row, index) => {
        doc.moveDown(0.35)
        doc.font('NotoSansBold').fontSize(10).fillColor('#182033').text(`${index + 1}. ${row.name}`)
        doc.font('NotoSans').fontSize(9).fillColor('#6D7485').text(
          `SKU ${row.sku} · продажи ${money(row.revenue)} · маржа ${money(row.margin)} · ДДР ${pct(row.adSpend / Math.max(row.revenue, 1))} · остаток ${units(row.stock)}`,
        )
      })

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return filePath
}
