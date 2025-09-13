const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getEstablishmentBookings
} = require('../controllers/bookingController');

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

// Create booking validation
const createBookingValidation = [
  body('courtId')
    .isUUID()
    .withMessage('Valid court ID is required'),
  body('date')
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid start time in HH:MM format'),
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid end time in HH:MM format'),
  body('duration')
    .isInt({ min: 30, max: 240 })
    .withMessage('Duration must be between 30 and 240 minutes'),
  body('totalAmount')
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  body('paymentType')
    .optional()
    .isIn(['full', 'split'])
    .withMessage('Payment type must be full or split'),
  body('playerCount')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Player count must be between 1 and 20'),
  body('splitPaymentData.totalParticipants')
    .if(body('paymentType').equals('split'))
    .isInt({ min: 2, max: 20 })
    .withMessage('Total participants must be between 2 and 20 for split payments'),
  body('splitPaymentData.participants')
    .if(body('paymentType').equals('split'))
    .isArray()
    .withMessage('Participants must be an array for split payments')
];

// Update booking validation
const updateBookingValidation = [
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
  body('cancellationReason')
    .if(body('status').equals('cancelled'))
    .notEmpty()
    .withMessage('Cancellation reason is required when cancelling')
];

// Query validation
const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
    .withMessage('Invalid status filter'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO format')
];

// Protected routes - all booking routes require authentication
router.use(authenticateToken);

// User booking routes
router.get('/', queryValidation, handleValidationErrors, getBookings);
router.post('/', createBookingValidation, handleValidationErrors, createBooking);
router.get('/:id', getBookingById);
router.put('/:id', updateBookingValidation, handleValidationErrors, updateBooking);
router.delete('/:id', cancelBooking);

// Establishment booking routes
router.get('/establishment/:establishmentId', 
  requireRole(['establishment', 'admin']), 
  queryValidation, 
  handleValidationErrors, 
  getEstablishmentBookings
);

module.exports = router;
