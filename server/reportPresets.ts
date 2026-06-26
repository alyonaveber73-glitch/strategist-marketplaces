import type { ReportType } from './types.js'

export type MarketplacePreset = {
  marketplace: 'ozon' | 'wildberries'
  reportType: ReportType
  sheetHints: string[]
  requiredHints: string[]
  aliases: Record<string, string[]>
}

export const presets: MarketplacePreset[] = [
  {
    marketplace: 'ozon',
    reportType: 'sales',
    sheetHints: ['заказы', 'продажи', 'sales'],
    requiredHints: ['номер заказа', 'оплачено', 'артикул'],
    aliases: {
      sku: ['SKU', 'Артикул', 'Ozon ID'],
      name: ['Название товара'],
      revenue: ['Оплачено покупателем', 'Заказано на сумму, ₽'],
      orders: ['Количество', 'Продано товаров'],
    },
  },
  {
    marketplace: 'ozon',
    reportType: 'ads',
    sheetHints: ['реклама', 'продвижение', 'ads'],
    requiredHints: ['показы', 'клики', 'расход'],
    aliases: {
      sku: ['SKU', 'Артикул'],
      name: ['Название товара'],
      impressions: ['Показы'],
      clicks: ['Клики'],
      carts: ['Добавления в корзину'],
      adSpend: ['Расход, ₽, с НДС', 'Расход'],
      revenue: ['Заказано на сумму, ₽'],
      orders: ['Продано товаров'],
    },
  },
  {
    marketplace: 'ozon',
    reportType: 'stocks',
    sheetHints: ['остатки', 'склад', 'stock'],
    requiredHints: ['остат', 'артикул'],
    aliases: { sku: ['SKU', 'Артикул'], name: ['Название товара'], stock: ['Остаток', 'Доступно к продаже'] },
  },
  {
    marketplace: 'wildberries',
    reportType: 'sales',
    sheetHints: ['продажи', 'заказы', 'wb', 'wildberries'],
    requiredHints: ['nm', 'заказ'],
    aliases: {
      sku: ['nmId', 'Артикул продавца', 'Баркод'],
      name: ['Предмет', 'Название'],
      revenue: ['Цена розничная', 'К перечислению продавцу', 'Сумма заказов'],
      orders: ['Кол-во', 'Количество'],
    },
  },
  {
    marketplace: 'wildberries',
    reportType: 'ads',
    sheetHints: ['реклама', 'кампания', 'advert'],
    requiredHints: ['показы', 'клики', 'затраты'],
    aliases: {
      sku: ['nmId', 'Артикул'],
      impressions: ['Показы'],
      clicks: ['Клики'],
      carts: ['Корзины'],
      adSpend: ['Затраты', 'Расход'],
      orders: ['Заказы'],
    },
  },
  {
    marketplace: 'wildberries',
    reportType: 'stocks',
    sheetHints: ['остатки', 'склад'],
    requiredHints: ['остаток', 'артикул'],
    aliases: { sku: ['nmId', 'Артикул продавца'], name: ['Предмет'], stock: ['Остаток', 'Количество'] },
  },
]

export function detectPreset(sheetName: string, headers: string[]) {
  const haystack = `${sheetName} ${headers.join(' ')}`.toLowerCase().replace(/ё/g, 'е')
  return presets.find((preset) => {
    const sheetMatches = preset.sheetHints.some((hint) => haystack.includes(hint.toLowerCase()))
    const requiredMatches = preset.requiredHints.every((hint) => haystack.includes(hint.toLowerCase()))
    return sheetMatches || requiredMatches
  })
}
