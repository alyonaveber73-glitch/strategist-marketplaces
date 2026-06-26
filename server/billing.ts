import Stripe from 'stripe'
import { db } from './db.js'
import type { Plan } from './types.js'

const stripeKey = process.env.STRIPE_SECRET_KEY || ''
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function createCheckout(userId: string, plan: Plan) {
  if (!stripe) {
    return {
      mode: 'demo' as const,
      plan,
      checkoutUrl: '',
      message: 'Stripe key is not configured. Billing API is ready, but payment is disabled in demo mode.',
    }
  }

  const price = plan === 'team' ? process.env.STRIPE_TEAM_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID
  if (!price) throw new Error('STRIPE_PRICE_ID_REQUIRED')

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: process.env.BILLING_SUCCESS_URL || 'http://localhost:5173?billing=success',
    cancel_url: process.env.BILLING_CANCEL_URL || 'http://localhost:5173?billing=cancel',
    metadata: { userId, plan },
  })

  db.prepare('INSERT INTO billing_events (id, user_id, provider, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    session.id,
    userId,
    'stripe',
    'checkout.created',
    JSON.stringify({ plan, sessionId: session.id }),
    new Date().toISOString(),
  )

  return { mode: 'stripe' as const, plan, checkoutUrl: session.url || '' }
}

export function setUserPlan(userId: string, plan: Plan) {
  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId)
}
