module.exports = (req, res) => {
  res.json({
    message: 'Hello from Vercel!',
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
};