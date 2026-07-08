const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

console.log('🔍 DATABASE_URL задана:', !!process.env.DATABASE_URL);
console.log('🔍 Хост:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'не найден');

// ===== ПОДКЛЮЧЕНИЕ К БАЗЕ =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== ТЕСТОВЫЙ МАРШРУТ БЕЗ БД (всегда работает) =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '✅ Сервер работает, БД пока не проверяем',
    dbUrlSet: !!process.env.DATABASE_URL
  });
});

// ===== НОВЫЙ МАРШРУТ ДЛЯ ПРОВЕРКИ БД =====
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      db: 'connected',
      time: result.rows[0].now,
      message: '✅ База данных подключена!'
    });
  } catch (err) {
    console.error('❌ Ошибка подключения к БД:', err.message);
    res.status(500).json({
      db: 'error',
      error: err.message,
      hint: 'Проверьте строку подключения в DATABASE_URL'
    });
  }
});

module.exports = app;
