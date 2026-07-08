const express = require('express');
const app = express();

// ===== ЛОГИРОВАНИЕ ПЕРЕМЕННОЙ =====
console.log('🔍 DATABASE_URL ПРОВЕРКА:');
console.log('  - Задана?', process.env.DATABASE_URL ? '✅ ДА' : '❌ НЕТ');
console.log('  - Значение:', process.env.DATABASE_URL || '❌ НЕ ЗАДАНА');

// ===== ТЕСТОВЫЙ МАРШРУТ =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '✅ Сервер работает, БД пока не проверяем',
    dbUrlSet: !!process.env.DATABASE_URL
  });
});

module.exports = app;
