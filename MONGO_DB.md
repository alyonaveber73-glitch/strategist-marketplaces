# MongoDB for Strategist Marketplaces

Проект умеет работать с MongoDB, если задан `MONGODB_URI`. Если переменной нет — используется локальный SQLite fallback `data/app.sqlite`.

## Переменные окружения

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=strategist_marketplaces
```

Боевые значения хранить только в `.env` на VPS/хостинге или в secrets, не коммитить в GitHub.

## Коллекции

- `users` — аккаунты. Пароль хранится в поле `passwordHash`, не plain text.
- `sessions` — токены входа, TTL по `expiresAt`.
- `unitEconomics` — справочник SKU.
- `analyses` — сохранённые анализы.
- `payments` — платежи YooKassa и сырые ответы API.

## Как смотреть в MongoDB Compass / Atlas Workspace

1. Открыть MongoDB Compass или Atlas → Browse Collections.
2. Подключиться по `MONGODB_URI`.
3. Открыть базу `strategist_marketplaces`.
4. Смотреть/фильтровать коллекции `users`, `payments`, `analyses`.

## Как безопасно поменять пароль пользователю

Не меняйте пароль руками в MongoDB: поле `passwordHash` должно быть scrypt-хешем.

Используйте скрипт:

```bash
MONGODB_URI='mongodb+srv://...' MONGODB_DB=strategist_marketplaces node scripts/set-password.mjs user@example.com new-password
```

Если `MONGODB_URI` не задан, скрипт обновит SQLite `DATA_DIR/app.sqlite`.

## YooKassa

Для боевой оплаты нужны:

```env
PUBLIC_URL=http://strateg-marketplaces.ru
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
```

Без ключей YooKassa backend создаёт demo-платёж `pending_demo` без списания.
