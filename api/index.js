// ===== ТОЧКА ВХОДА ДЛЯ VERCEL =====
module.exports = (req, res) => {
  // Перенаправляем на health.js
  const healthHandler = require('./health');
  return healthHandler(req, res);
};