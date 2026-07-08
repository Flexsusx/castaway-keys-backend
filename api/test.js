module.exports = (req, res) => {
  res.json({
    message: 'API работает!',
    timestamp: new Date().toISOString()
  });
};