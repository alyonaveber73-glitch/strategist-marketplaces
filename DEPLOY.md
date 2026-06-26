# Deploy

## Local production-like run

```bash
cp .env.example .env
npm install
npm run build
npm run dev:server
```

## Docker Compose with PostgreSQL

```bash
docker compose up --build
```

`DATABASE_URL` enables PostgreSQL migrations. SQLite remains the local fallback.

## Billing

Set Stripe variables before enabling real payments:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_TEAM_PRICE_ID=price_...
BILLING_SUCCESS_URL=https://your-domain.com?billing=success
BILLING_CANCEL_URL=https://your-domain.com?billing=cancel
```

Without `STRIPE_SECRET_KEY`, `/api/billing/checkout` returns demo mode and does not charge anyone.

## Minimum production checklist

- Strong `JWT_SECRET`
- HTTPS domain
- PostgreSQL backup
- File size/rate limits
- Private env vars in hosting dashboard
- Stripe webhook endpoint before real billing
