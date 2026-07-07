# Ozon Conversions

Отдельный мини‑проект для таблицы конверсий через Ozon Seller API.

## Что показывает

- SKU
- товар
- выручка
- показы
- переходы
- добавления в корзину
- заказы
- конверсия показ → корзина
- конверсия корзина → заказ
- конверсия показ → заказ

## Настройка

```bash
cd ozon-conversions
cp .env.example .env
nano .env
```

В `.env` нужны:

```env
OZON_CLIENT_ID=...
OZON_API_KEY=...
```

Опционально:

```env
OZON_DATE_FROM=2026-07-01
OZON_DATE_TO=2026-07-31
OZON_ANALYTICS_LIMIT=1000
```

Если даты не заданы, берутся последние 30 дней до вчерашнего дня.

## Запуск локально / на VPS

```bash
npm install --include=dev
npm run build
PORT=8788 npm run dev:server
```

После запуска открыть:

```text
http://SERVER_IP:8788/
```

Или настроить nginx/domain отдельно.

## Важно

Для Seller API обычно нужны оба значения: `Client-Id` и `Api-Key`. Ключи не коммитить в GitHub.
