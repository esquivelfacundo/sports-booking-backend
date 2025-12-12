const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  getEstablishmentReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews
} = require('../controllers/reviewController');

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

// Create review validation
const createReviewValidation = [
  body('establishmentId').isUUID().withMessage('Valid establishment ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 1000 }).withMessage('Comment max 1000 characters')
];

// Update review validation
const updateReviewValidation = [
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 1000 }).withMessage('Comment max 1000 characters')
];

// Public routes
router.get('/establishment/:establishmentId', optionalAuth, getEstablishmentReviews);
router.get('/user/:userId', optionalAuth, getUserReviews);
router.get('/:id', optionalAuth, getReviewById);

// Protected routes
router.post('/', authenticateToken, createReviewValidation, handleValidationErrors, createReview);
router.put('/:id', authenticateToken, updateReviewValidation, handleValidationErrors, updateReview);
router.delete('/:id', authenticateToken, deleteReview);

module.exports = router;
