# Ozon Seller API conversions

Проект умеет строить таблицу конверсий через Ozon Seller API.

## Где взять ключи

В личном кабинете Ozon Seller нужен не только `Api-Key`, но и `Client-Id`.
Обычно они находятся в настройках API/интеграций продавца.

## .env на VPS

```env
OZON_CLIENT_ID=123456
OZON_API_KEY=***
```

Опционально можно задать период:

```env
OZON_DATE_FROM=2026-07-01
OZON_DATE_TO=2026-07-31
OZON_ANALYTICS_LIMIT=1000
```

Если период не задан, backend берёт последние 30 дней до вчерашнего дня.

## Endpoint

```http
GET /api/ozon/conversions
```

Возвращает строки:

- `sku`
- `offerId`
- `name`
- `revenue`
- `orders`
- `impressions`
- `clicks`
- `carts`
- `viewToCart`
- `cartToOrder`
- `viewToOrder`

## Важно

Ozon Seller API и Ozon Performance API — разные API. Эта первая версия берёт аналитику Seller API. Если нужны рекламные конверсии/расходы по кампаниям, следующим шагом подключается Performance API.
