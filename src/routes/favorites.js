const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  toggleFavorite
} = require('../controllers/favoriteController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Add favorite validation
const addFavoriteValidation = [
  body('establishmentId').isUUID().withMessage('Valid establishment ID required')
];

// All routes require authentication
router.use(authenticateToken);

// Get user's favorites
router.get('/', getFavorites);

// Add to favorites
router.post('/', addFavoriteValidation, handleValidationErrors, addFavorite);

// Check if establishment is favorited
router.get('/check/:establishmentId', checkFavorite);

// Toggle favorite (add/remove)
router.post('/toggle/:establishmentId', toggleFavorite);

// Remove from favorites
router.delete('/:establishmentId', removeFavorite);

module.exports = router;
