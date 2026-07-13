import type { NextFunction, Request, Response } from 'express'

const MAX_KEY_LENGTH = 120

type Bucket = { count: number; resetAt: number }

function clientKey(req: Request) {
  const forwardedFor = req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return (forwardedFor || req.ip || req.socket.remoteAddress || 'unknown').slice(0, MAX_KEY_LENGTH)
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  next()
}

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>()
  const cleanupEveryMs = Math.max(options.windowMs, 60_000)
  let lastCleanup = Date.now()

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    if (now - lastCleanup > cleanupEveryMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key)
      }
      lastCleanup = now
    }

    const key = clientKey(req)
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs })
      next()
      return
    }

    bucket.count += 1
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      res.status(429).json({ error: 'RATE_LIMITED', message: options.message || 'Слишком много запросов. Попробуйте позже.' })
      return
    }
    next()
  }
}

export function validateSafeUrl(value: string, fallback: string) {
  try {
    const url = new URL(value || fallback)
    if (!['http:', 'https:'].includes(url.protocol)) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}
