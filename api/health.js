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
      time: result.rows[0].now
    });
  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message);
    res.status(500).json({
      db: 'error',
      error: err.message,
      hint: 'Проверьте DATABASE_URL'
    });
  }
};
