const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Placeholder routes - will be implemented later
router.get('/', (req, res) => {
  res.json({ message: 'Tournaments endpoint - to be implemented' });
});

module.exports = router;
