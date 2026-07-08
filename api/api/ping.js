module.exports = (req, res) => {
  res.json({
    status: 'ok',
    message: 'Пинг от Vercel!',
    timestamp: new Date().toISOString()
  });
};
