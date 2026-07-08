const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');

const app = express();

// ===== БЕЗОПАСНОСТЬ =====
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== ПОДКЛЮЧЕНИЕ К POSTGRESQL (Supabase) =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Проверка подключения
pool.connect()
  .then(() => console.log('✅ PostgreSQL подключена (Supabase)'))
  .catch(err => console.error('❌ Ошибка подключения:', err.message));

// ===== СОЗДАНИЕ ТАБЛИЦ =====
async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица users создана');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS keys (
        id SERIAL PRIMARY KEY,
        product TEXT NOT NULL,
        key TEXT UNIQUE NOT NULL,
        period TEXT NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        used_by TEXT,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица keys создана');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        product TEXT NOT NULL,
        key TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        purchased_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица user_keys создана');
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err.message);
  }
}
initTables();

// ===== МАРШРУТЫ =====

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      timestamp: result.rows[0].now,
      db: 'connected'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin',
      [username, passwordHash, username === 'FlexsusXXX']
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        keys: []
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        keys: []
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, username, is_admin FROM users WHERE id = $1', [decoded.userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        keys: []
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
});

app.post('/api/keys/claim', async (req, res) => {
  try {
    const { product, period } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const keyResult = await pool.query(
      'SELECT * FROM keys WHERE product = $1 AND period = $2 AND used = FALSE ORDER BY created_at LIMIT 1',
      [product, period]
    );

    if (keyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Нет доступных ключей для этого периода' });
    }

    const key = keyResult.rows[0];

    await pool.query(
      'UPDATE keys SET used = TRUE, used_by = $1, used_at = NOW() WHERE id = $2',
      [decoded.username, key.id]
    );

    const expires = new Date();
    const days = parseInt(period);
    expires.setDate(expires.getDate() + (isNaN(days) ? 30 : days));

    await pool.query(
      'INSERT INTO user_keys (user_id, product, key, expires) VALUES ($1, $2, $3, $4)',
      [decoded.userId, product, key.key, expires]
    );

    res.json({
      key: key.key,
      period: key.period,
      expires: expires
    });
  } catch (error) {
    console.error('Claim key error:', error);
    res.status(500).json({ error: 'Ошибка получения ключа' });
  }
});

app.post('/api/keys', async (req, res) => {
  try {
    const { product, key, period } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    await pool.query(
      'INSERT INTO keys (product, key, period) VALUES ($1, $2, $3)',
      [product, key, period]
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Add key error:', error);
    res.status(500).json({ error: 'Ошибка добавления ключа' });
  }
});

app.get('/api/keys', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const result = await pool.query('SELECT * FROM keys ORDER BY created_at DESC');
    res.json({ keys: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения ключей' });
  }
});

app.delete('/api/keys/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    await pool.query('DELETE FROM keys WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления ключа' });
  }
});

// ===== ЭКСПОРТ ДЛЯ VERCEL =====
module.exports = app;