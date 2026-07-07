import { randomUUID } from 'node:crypto'

export type PlanKey = 'start' | 'pro' | 'business'

export const plans: Record<PlanKey, { name: string; amount: number; termDays: number }> = {
  start: { name: 'Старт', amount: 990, termDays: 30 },
  pro: { name: 'Профи', amount: 2490, termDays: 90 },
  business: { name: 'Бизнес', amount: 7900, termDays: 365 },
}

export function isPlanKey(value: string): value is PlanKey {
  return value in plans
}

type YooKassaPayment = {
  id: string
  status: string
  confirmation?: { confirmation_url?: string }
}

export async function createYooKassaPayment(params: { plan: PlanKey; userId: string; email: string; returnUrl: string }) {
  const shopId = process.env.YOOKASSA_SHOP_ID
  const secretKey = process.env.YOOKASSA_SECRET_KEY
  const plan = plans[params.plan]

  if (!shopId || !secretKey) {
    const fakeId = `demo-${randomUUID()}`
    return {
      id: fakeId,
      status: 'pending_demo',
      confirmationUrl: params.returnUrl,
      amount: plan.amount,
      raw: { demo: true, message: 'YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY не заданы' },
    }
  }

  const body = {
    amount: { value: plan.amount.toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: params.returnUrl },
    description: `Подписка «${plan.name}» — Стратег маркетплейсов`,
    metadata: { userId: params.userId, plan: params.plan },
    receipt: {
      customer: { email: params.email },
      items: [{
        description: `Подписка «${plan.name}»`,
        quantity: '1.00',
        amount: { value: plan.amount.toFixed(2), currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      }],
    },
  }

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': randomUUID(),
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({})) as YooKassaPayment & { description?: string }
  if (!response.ok) {
    throw new Error(data.description || 'YooKassa не создала платёж')
  }

  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url || params.returnUrl,
    amount: plan.amount,
    raw: data,
  }
}
