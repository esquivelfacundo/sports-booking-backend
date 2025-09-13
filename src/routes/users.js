const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Placeholder routes - will be implemented later
router.get('/', authenticateToken, (req, res) => {
  res.json({ message: 'Users endpoint - to be implemented' });
});

module.exports = router;
