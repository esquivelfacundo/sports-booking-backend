const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  getEstablishmentCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponStats
} = require('../controllers/couponController');

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

// Create coupon validation
const createCouponValidation = [
  body('code').notEmpty().withMessage('Coupon code is required'),
  body('name').notEmpty().withMessage('Coupon name is required'),
  body('discountType').isIn(['percentage', 'fixed_amount', 'free_booking']).withMessage('Invalid discount type'),
  body('discountValue').isNumeric().withMessage('Discount value must be a number')
];

// Public routes
router.post('/validate', optionalAuth, validateCoupon);

// Protected routes - Establishment management
router.get('/establishment/:establishmentId', authenticateToken, getEstablishmentCoupons);
router.get('/establishment/:establishmentId/stats', authenticateToken, getCouponStats);
router.get('/:id', authenticateToken, getCouponById);
router.post('/', authenticateToken, createCouponValidation, handleValidationErrors, createCoupon);
router.put('/:id', authenticateToken, updateCoupon);
router.delete('/:id', authenticateToken, deleteCoupon);
router.post('/apply', authenticateToken, applyCoupon);

module.exports = router;
