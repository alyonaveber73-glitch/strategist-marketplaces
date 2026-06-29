import type { ProductMetric, Strategy, Totals } from './types.js'

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function buildRuleStrategy(rows: ProductMetric[], totals: Totals): Strategy {
  const sortedByMargin = [...rows].sort((a, b) => b.margin - a.margin)
  const ddr = totals.adSpend / Math.max(totals.revenue, 1)
  const lowStock = [...rows].filter((row) => row.stock > 0 && row.orders > 0 && row.stock < row.orders * 0.5).sort((a, b) => a.stock - b.stock)
  const highSpendLowMargin = [...rows]
    .filter((row) => row.adSpend / Math.max(row.revenue, 1) > 0.2 || row.margin / Math.max(row.revenue, 1) < 0.15)
    .sort((a, b) => b.adSpend - a.adSpend)

  return {
    source: 'rules',
    headline: `Цель месяца: удержать ДДР около ${pct(ddr)}, масштабировать маржинальные SKU и контролировать остатки/акции.`,
    focusProducts: sortedByMargin.slice(0, 3),
    risks: [
      highSpendLowMargin[0]
        ? `Высокий ДДР или слабая маржа у «${highSpendLowMargin[0].name}»: сначала чистим рекламу, потом масштабируем.`
        : 'Критичных провалов по рекламе не видно — можно аккуратно масштабировать лидеров.',
      lowStock[0]
        ? `Риск out-of-stock у «${lowStock[0].name}»: остаток ниже текущего темпа заказов.`
        : 'По остаткам явного критичного риска не видно, но ТОП-SKU всё равно нужно держать под контролем.',
      totals.costTotal
        ? 'Маржа считается с учётом себестоимости, комиссии, эквайринга, логистики и налогов из справочника.'
        : 'Справочник себестоимости не заполнен полностью — маржа может быть завышена.',
    ],
    actions: [
      'Разделить товары на 3 группы: масштабировать, удерживать, остановить рекламу.',
      'Оставить бюджет на SKU с положительной маржой и управляемым ДДР; убыточные кампании отключить.',
      'Для ТОП-3 маржинальных товаров обновить главное фото, SEO-заголовок, инфографику и блок выгод.',
      'Проверить остатки по лидерам и запланировать поставку минимум на 30 дней продаж.',
      'Акции запускать только на SKU, где после скидки остаётся положительная маржа.',
      'Через 7 дней сравнить продажи, ДДР, маржу и три конверсии; бюджет перераспределить по факту.',
    ],
  }
}

export async function buildAiStrategy(rows: ProductMetric[], totals: Totals): Promise<Strategy> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return buildRuleStrategy(rows, totals)

  const fallback = buildRuleStrategy(rows, totals)
  const topRows = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 20)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Ты эксперт по Ozon/Wildberries. Верни только JSON: headline string, risks string[], actions string[]. Учитывай продажи, рекламу, остатки, акции, себестоимость, комиссии, эквайринг, логистику, налоги. Пиши по-русски, конкретно, для продавца маркетплейса.',
          },
          { role: 'user', content: JSON.stringify({ totals, products: topRows }) },
        ],
        temperature: 0.35,
      }),
    })

    if (!response.ok) return fallback
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd < 0) return fallback
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as Pick<Strategy, 'headline' | 'risks' | 'actions'>
    return { ...fallback, ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}


export async function buildImageAiStrategy(image: { buffer: Buffer; fileName: string; mimeType: string }): Promise<Pick<Strategy, 'headline' | 'risks' | 'actions' | 'source'>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      source: 'rules',
      headline: 'Для анализа изображения нужен OPENAI_API_KEY в .env.',
      risks: ['Изображение загружено, но AI-ключ не найден — скриншот нельзя распознать автоматически.'],
      actions: ['Добавьте OPENAI_API_KEY в .env, перезапустите backend и загрузите изображение снова.'],
    }
  }

  try {
    const base64 = image.buffer.toString('base64')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Ты эксперт по аналитике Ozon/Wildberries. Проанализируй скриншот отчёта или кабинета. Верни только JSON: headline string, risks string[], actions string[]. Пиши по-русски, конкретно: что видно, какие метрики важны, что не так, что сделать дальше.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Проанализируй изображение ${image.fileName}. Если это таблица/дашборд, извлеки видимые показатели и дай выводы.` },
              { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.25,
      }),
    })

    if (!response.ok) throw new Error(`OpenAI error ${response.status}`)
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON in image analysis response')
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as Pick<Strategy, 'headline' | 'risks' | 'actions'>
    return { ...parsed, source: 'ai' }
  } catch (error) {
    return {
      source: 'rules',
      headline: 'Не получилось автоматически проанализировать изображение.',
      risks: [error instanceof Error ? error.message : 'Неизвестная ошибка анализа изображения.'],
      actions: ['Проверьте OPENAI_API_KEY, модель с поддержкой изображений и попробуйте загрузить скриншот снова.'],
    }
  }
}
