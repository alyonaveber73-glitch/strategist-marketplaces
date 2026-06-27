import type { DataQuality, ProductMetric, ReportType, Totals } from './types.js'

const expectedReports: ReportType[] = ['sales', 'ads', 'stocks', 'promotions']

export function buildDataQuality(rows: ProductMetric[], totals: Totals, reportTypes: ReportType[]): DataQuality {
  const recognizedReports = reportTypes.filter((type) => type !== 'unknown')
  const missingReports = expectedReports.filter((type) => !recognizedReports.includes(type))
  const warnings: string[] = []
  const suggestions: string[] = []

  if (reportTypes.includes('unknown')) {
    warnings.push('Есть листы или файлы с нераспознанным типом отчёта.')
    suggestions.push('Переименуйте листы/колонки ближе к Ozon/WB: продажи, заказы, реклама, показы, клики, остаток, акции.')
  }

  if (!totals.revenue || !totals.orders) {
    warnings.push('Продажи или заказы не найдены — стратегия по выручке будет неполной.')
    suggestions.push('Добавьте отчёт продаж/заказов с колонками SKU, название, выручка и количество заказов.')
  }

  if (!totals.adSpend && !totals.impressions && !totals.clicks) {
    warnings.push('Рекламные метрики не найдены — ДДР и воронка будут неполными.')
    suggestions.push('Добавьте отчёт рекламы с расходом, показами, кликами и корзинами.')
  }

  if (!totals.stock) {
    warnings.push('Остатки не найдены — риск out-of-stock считается приблизительно.')
    suggestions.push('Добавьте отчёт по остаткам FBO/FBS или складской выгрузке.')
  }

  if (!totals.costTotal && !totals.commissionTotal) {
    warnings.push('Справочник юнит-экономики пустой или не совпал по SKU — маржа может быть завышена.')
    suggestions.push('Импортируйте справочник SKU с себестоимостью, комиссией, эквайрингом, логистикой и налогом.')
  }

  const emptySkuShare = rows.length ? rows.filter((row) => row.sku.startsWith('row-')).length / rows.length : 1
  if (emptySkuShare > 0.2) {
    warnings.push('У части строк не найден SKU/артикул — товары могут склеиваться неточно.')
    suggestions.push('Проверьте, что в файлах есть колонка SKU, артикул, id товара, offer_id или barcode.')
  }

  const score = Math.max(0, Math.round(100 - missingReports.length * 12 - warnings.length * 8 - emptySkuShare * 20))

  return {
    score,
    recognizedReports,
    missingReports,
    warnings: warnings.length ? warnings : ['Критичных проблем качества данных не найдено.'],
    suggestions: suggestions.slice(0, 5),
  }
}
