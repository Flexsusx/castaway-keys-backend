const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  try {
    console.log('🔍 Начинаем вход...');
    
    // Проверяем переменную DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL не задана!');
      return res.status(500).json({ error: 'DATABASE_URL не задана' });
    }
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const { username, password } = req.body;
    console.log('🔍 Получены данные:', { username, password: password ? '***' : 'не передан' });
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    console.log('🔍 Ищем пользователя...');
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    
    if (!user) {
      console.log('❌ Пользователь не найден');
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    console.log('🔍 Проверяем пароль...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      console.log('❌ Пароль неверный');
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    console.log('🔍 Создаём токен...');
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('🔍 Получаем ключи...');
    const keysResult = await pool.query(
      'SELECT product, key, expires FROM user_keys WHERE user_id = $1 ORDER BY purchased_at DESC',
      [user.id]
    );

    console.log('✅ Успешный вход!');
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
    console.error('❌ Ошибка входа:', error.message);
    console.error('❌ Стек ошибки:', error.stack);
    res.status(500).json({ 
      error: 'Ошибка входа', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
