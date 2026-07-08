const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
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
};
