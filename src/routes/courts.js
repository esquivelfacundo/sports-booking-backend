const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  createCourt,
  getAllCourts,
  getCourts,
  getCourtById,
  updateCourt,
  deleteCourt,
  getCourtAvailability
} = require('../controllers/courtController');

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

// Create court validation
const createCourtValidation = [
  body('establishmentId')
    .isUUID()
    .withMessage('Valid establishment ID is required'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Court name must be between 2 and 100 characters'),
  body('sport')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Sport must be between 2 and 50 characters'),
  body('surface')
    .optional()
    .isIn(['grass', 'clay', 'hard', 'synthetic', 'indoor', 'outdoor'])
    .withMessage('Invalid surface type'),
  body('isIndoor')
    .optional()
    .isBoolean()
    .withMessage('isIndoor must be a boolean'),
  body('capacity')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Capacity must be between 1 and 50'),
  body('pricePerHour')
    .isFloat({ min: 0 })
    .withMessage('Price per hour must be a positive number'),
  body('pricePerHour90')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price per 90 minutes must be a positive number'),
  body('pricePerHour120')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price per 120 minutes must be a positive number'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Amenities must be an array'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array')
];

// Update court validation
const updateCourtValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Court name must be between 2 and 100 characters'),
  body('sport')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Sport must be between 2 and 50 characters'),
  body('surface')
    .optional()
    .isIn(['grass', 'clay', 'hard', 'synthetic', 'indoor', 'outdoor'])
    .withMessage('Invalid surface type'),
  body('isIndoor')
    .optional()
    .isBoolean()
    .withMessage('isIndoor must be a boolean'),
  body('capacity')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Capacity must be between 1 and 50'),
  body('pricePerHour')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price per hour must be a positive number'),
  body('pricePerHour90')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price per 90 minutes must be a positive number'),
  body('pricePerHour120')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price per 120 minutes must be a positive number'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Amenities must be an array'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array')
];

// Availability query validation
const availabilityValidation = [
  query('date')
    .isISO8601()
    .withMessage('Please provide a valid date in ISO format'),
  query('duration')
    .optional()
    .isInt({ min: 30, max: 240 })
    .withMessage('Duration must be between 30 and 240 minutes')
];

// Public routes
router.get('/', getAllCourts);
router.get('/establishment/:establishmentId', getCourts);
router.get('/:id', getCourtById);
router.get('/:id/availability', availabilityValidation, handleValidationErrors, getCourtAvailability);

// Protected routes - require establishment owner or admin
router.post('/', authenticateToken, requireRole(['establishment', 'admin']), createCourtValidation, handleValidationErrors, createCourt);
router.put('/:id', authenticateToken, requireRole(['establishment', 'admin']), updateCourtValidation, handleValidationErrors, updateCourt);
router.delete('/:id', authenticateToken, requireRole(['establishment', 'admin']), deleteCourt);

module.exports = router;
