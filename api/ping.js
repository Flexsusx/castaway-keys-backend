module.exports = (req, res) => {
  res.json({
    status: 'ok',
    message: 'Пинг от Vercel!',
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? 'Задана' : 'НЕ ЗАДАНА'
    }
  });
};