# SQLite database

Проект использует SQLite: файл базы создаётся автоматически по пути `DATA_DIR/app.sqlite`.

В `.env` можно указать:

```env
DATA_DIR=./data
```

Если `DATA_DIR` не задан, будет использована папка `./data` внутри проекта.

## Что хранится в базе

- `users` — аккаунты пользователей. Пароль хранится как `password_hash`, не plain text.
- `subscriptions` — подписки пользователей: `active`, `inactive`, `expired`, `cancelled`.
- `sessions` — токены входа.
- `payments` — платежи и ответы платёжной системы.
- `analyses` — история анализов.
- `unit_economics` — справочник юнит-экономики.

## Логика доступа

1. Пользователь регистрируется через `/api/auth/register`.
2. Данные сразу сохраняются в SQLite.
3. При входе `/api/auth/login` проверяется email + пароль.
4. API анализа, истории, экспорта и юнит-экономики доступен только при активной подписке.
5. Активная подписка — это запись в `subscriptions` со статусом `active` и датой `expires_at` в будущем.

## Смена пароля

```bash
DATA_DIR=./data node scripts/set-password.mjs user@example.com new-password
```

## Ручная проверка базы на VPS

```bash
sqlite3 data/app.sqlite
.tables
SELECT email, subscription_status, subscription_plan, subscription_until FROM users;
SELECT user_id, status, plan, expires_at FROM subscriptions;
```
