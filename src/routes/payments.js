const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  createPayment,
  createSplitPayment,
  handleWebhook,
  handleSplitPaymentWebhook,
  getPaymentStatus,
  refundPayment
} = require('../controllers/paymentController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input data',
      details: errors.array()
    });
  }
  next();
};

// Create payment validation
const createPaymentValidation = [
  body('bookingId')
    .isUUID()
    .withMessage('Valid booking ID is required'),
  body('paymentMethod')
    .optional()
    .isIn(['mercadopago', 'credit_card', 'debit_card'])
    .withMessage('Invalid payment method')
];

// Create split payment validation
const createSplitPaymentValidation = [
  body('splitPaymentId')
    .isUUID()
    .withMessage('Valid split payment ID is required')
];

// Refund validation
const refundValidation = [
  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
];

// Public webhook routes (no authentication)
router.post('/webhook', handleWebhook);
router.post('/webhook/split', handleSplitPaymentWebhook);

// Protected routes
router.use(authenticateToken);

// Payment routes
router.post('/', createPaymentValidation, handleValidationErrors, createPayment);
router.post('/split', createSplitPaymentValidation, handleValidationErrors, createSplitPayment);
router.get('/:id/status', getPaymentStatus);

// Establishment owner routes
router.post('/:id/refund', 
  requireRole(['establishment', 'admin']), 
  refundValidation, 
  handleValidationErrors, 
  refundPayment
);

module.exports = router;
