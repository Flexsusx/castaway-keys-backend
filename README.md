# Castaway Keys — Backend

Backend для сайта Castaway Keys — магазина читов PUBG Mobile.

## Технологии

- Node.js
- Express
- PostgreSQL (Supabase)
- JWT авторизация

## Деплой на Vercel

1. Скопируйте репозиторий
2. Добавьте переменные окружения в Vercel
3. Деплой

## API

- `GET /api/health` — проверка работы
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход
- `GET /api/auth/verify` — проверка токена
- `GET /api/keys` — получить все ключи (админ)
- `POST /api/keys` — добавить ключ (админ)
- `DELETE /api/keys/:id` — удалить ключ (админ)
- `POST /api/keys/claim` — получить ключ (покупка)