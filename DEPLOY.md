# Deploy

Простая версия без оплаты и базы данных.

## Local run

```bash
cp .env.example .env
npm install
npm run dev:server
npm run dev
```

## Docker

```bash
docker build -t marketplace-strategist .
docker run -p 8787:8787 marketplace-strategist
```

## Важно

- Данные анализов хранятся только в памяти запущенного сервера.
- После перезапуска история очищается.
- Для продакшена позже можно вернуть PostgreSQL, но сейчас MVP максимально простой.
- Оплаты, тарифов и личного кабинета нет намеренно.
