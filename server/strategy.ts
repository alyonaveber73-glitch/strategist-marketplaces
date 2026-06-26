import type { ProductMetric, Strategy, Totals } from './types.js'

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function buildRuleStrategy(rows: ProductMetric[], totals: Totals): Strategy {
  const sortedByMargin = [...rows].sort((a, b) => b.margin - a.margin)
  const ddr = totals.adSpend / Math.max(totals.revenue, 1)
  const highSpendLowMargin = [...rows]
    .filter((row) => row.adSpend / Math.max(row.revenue, 1) > 0.2 || row.margin / Math.max(row.revenue, 1) < 0.15)
    .sort((a, b) => b.adSpend - a.adSpend)

  return {
    source: 'rules',
    headline: `Цель месяца: удержать ДДР около ${pct(ddr)}, масштабировать маржинальные SKU и отключить неэффективные рекламные связки.`,
    focusProducts: sortedByMargin.slice(0, 3),
    risks: [
      highSpendLowMargin[0]
        ? `Высокий ДДР или слабая маржа у «${highSpendLowMargin[0].name}»: сначала чистим рекламу, потом масштабируем.`
        : 'Критичных провалов по рекламе не видно — можно аккуратно масштабировать лидеров.',
      'Если остатки по ТОП-SKU ниже месячного спроса, рост упрётся в out-of-stock.',
      'Низкая корзина→заказ обычно означает проблему цены, отзывов, доставки или оффера.',
    ],
    actions: [
      'Разделить товары на 3 группы: масштабировать, удерживать, заморозить рекламу.',
      'Оставить рекламный бюджет на SKU с положительной маржой и управляемым ДДР.',
      'Для ТОП-3 товаров обновить главное фото, SEO-заголовок, инфографику и блок выгод.',
      'Отключить запросы/кампании без заказов, ставки повышать только там, где есть продажи.',
      'Через 7 дней сравнить продажи, ДДР, маржу и три конверсии; бюджет перераспределить по факту.',
    ],
  }
}

export async function buildAiStrategy(rows: ProductMetric[], totals: Totals): Promise<Strategy> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return buildRuleStrategy(rows, totals)

  const fallback = buildRuleStrategy(rows, totals)
  const topRows = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 15)

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
              'Ты эксперт по Ozon/Wildberries. Верни только JSON: headline string, risks string[], actions string[]. Пиши по-русски, конкретно, для продавца маркетплейса.',
          },
          {
            role: 'user',
            content: JSON.stringify({ totals, products: topRows }),
          },
        ],
        temperature: 0.4,
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
