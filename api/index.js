const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? '✅ Задана' : '❌ НЕ ЗАДАНА');

// ===== ПОДКЛЮЧЕНИЕ К БАЗЕ =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== МАРШРУТЫ =====

// Простой тестовый маршрут (аналог hello.js)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Маршрут для проверки базы данных
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      db: 'connected',
      time: result.rows[0].now
    });
  } catch (err) {
    res.status(500).json({ 
      db: 'error', 
      error: err.message,
      hint: 'Проверьте DATABASE_URL в переменных окружения'
    });
  }
});

// ===== ЭКСПОРТ ДЛЯ VERCEL =====
module.exports = app;
