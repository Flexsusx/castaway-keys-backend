app.get('/api/test', (req, res) => {
    res.json({ message: 'API работает!', time: new Date().toISOString() });
});
