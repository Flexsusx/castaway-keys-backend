const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ===== ОПТИМИЗАЦИЯ: Кеширование и сжатие =====
app.use(require('compression')());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== CORS (оптимизирован) =====
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  maxAge: 86400 // кешируем CORS на 24 часа
}));

// ===== ПУЛ СОЕДИНЕНИЙ (оптимизирован) =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // максимум соединений
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ===== КЕШИРОВАНИЕ КЛЮЧЕЙ (в памяти) =====
let keysCache = {
  data: null,
  timestamp: 0,
  ttl: 30000 // 30 секунд
};

async function getCachedKeys() {
  const now = Date.now();
  if (keysCache.data && (now - keysCache.timestamp) < keysCache.ttl) {
    return keysCache.data;
  }
  
  const result = await pool.query('SELECT * FROM keys ORDER BY created_at DESC');
  keysCache.data = result.rows;
  keysCache.timestamp = now;
  return keysCache.data;
}

// ===== ТАБЛИЦЫ (создаются один раз) =====
let tablesInitialized = false;

async function initTables() {
  if (tablesInitialized) return;
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
    console.log('✅ Таблицы готовы');
    tablesInitialized = true;
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err.message);
  }
}
initTables();

// ===== МАРШРУТЫ (с кешированием) =====

// Проверка работы (быстрый ответ)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    db: pool.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// РЕГИСТРАЦИЯ
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });

    const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Пользователь уже существует' });

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

// ВХОД
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Получаем ключи пользователя
    const keysResult = await pool.query(
      'SELECT product, key, expires FROM user_keys WHERE user_id = $1 ORDER BY purchased_at DESC',
      [user.id]
    );

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        isAdmin: user.is_admin, 
        keys: keysResult.rows || [] 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ПРОВЕРКА ТОКЕНА
app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, username, is_admin FROM users WHERE id = $1', [decoded.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const keysResult = await pool.query(
      'SELECT product, key, expires FROM user_keys WHERE user_id = $1 ORDER BY purchased_at DESC',
      [user.id]
    );

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        keys: keysResult.rows || []
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
});

// ПРОФИЛЬ (с кешированием ключей пользователя)
app.get('/api/auth/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await pool.query('SELECT id, username, is_admin FROM users WHERE id = $1', [decoded.userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const keysResult = await pool.query(
      'SELECT product, key, expires FROM user_keys WHERE user_id = $1 ORDER BY purchased_at DESC',
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        keys: keysResult.rows || []
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

// ===== КЛЮЧИ (с кешированием) =====

// ПОЛУЧИТЬ ВСЕ КЛЮЧИ (только админ)
app.get('/api/keys', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Доступ запрещён' });

    // Используем кеш
    const keys = await getCachedKeys();
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения ключей' });
  }
});

// ДОБАВИТЬ КЛЮЧ (только админ)
app.post('/api/keys', async (req, res) => {
  try {
    const { product, key, period } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Доступ запрещён' });

    if (!product || !key || !period) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    const existing = await pool.query('SELECT * FROM keys WHERE key = $1', [key]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Такой ключ уже существует' });
    }

    await pool.query(
      'INSERT INTO keys (product, key, period, used) VALUES ($1, $2, $3, false)',
      [product, key, period]
    );

    // Обновляем кеш
    keysCache.data = null;

    res.status(201).json({ success: true, message: 'Ключ добавлен' });
  } catch (error) {
    console.error('Add key error:', error);
    res.status(500).json({ error: 'Ошибка добавления ключа' });
  }
});

// УДАЛИТЬ КЛЮЧ (только админ)
app.delete('/api/keys/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Доступ запрещён' });

    await pool.query('DELETE FROM keys WHERE id = $1', [req.params.id]);
    
    // Обновляем кеш
    keysCache.data = null;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления ключа' });
  }
});

// ПОЛУЧИТЬ КЛЮЧ (покупка)
app.post('/api/keys/claim', async (req, res) => {
  try {
    const { product, period } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const keyResult = await pool.query(
      'SELECT * FROM keys WHERE product = $1 AND period = $2 AND used = false ORDER BY created_at LIMIT 1',
      [product, period]
    );

    if (keyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Нет доступных ключей для этого периода' });
    }

    const key = keyResult.rows[0];

    await pool.query(
      'UPDATE keys SET used = true, used_by = $1, used_at = NOW() WHERE id = $2',
      [decoded.username, key.id]
    );

    const expires = new Date();
    const days = parseInt(period);
    expires.setDate(expires.getDate() + (isNaN(days) ? 30 : days));

    await pool.query(
      'INSERT INTO user_keys (user_id, product, key, expires) VALUES ($1, $2, $3, $4)',
      [decoded.userId, product, key.key, expires]
    );

    // Обновляем кеш
    keysCache.data = null;

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

module.exports = app;
