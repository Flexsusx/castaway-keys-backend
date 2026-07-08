const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

console.log('🔍 Проверка переменной DATABASE_URL:', process.env.DATABASE_URL ? '✅ Задана' : '❌ НЕ ЗАДАНА');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      message: '✅ Сервер работает, база данных подключена!',
      time: result.rows[0].now
    });
  } catch (err) {
    console.error('❌ Ошибка запроса к БД:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка подключения к базе данных',
      error: err.message
    });
  }
});

module.exports = app;
