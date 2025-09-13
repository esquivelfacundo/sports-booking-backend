const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const {
  createEstablishment,
  getEstablishments,
  getEstablishmentById,
  updateEstablishment,
  deleteEstablishment,
  getMyEstablishments,
  getFeaturedEstablishments
} = require('../controllers/establishmentController');

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

// Create establishment validation
const createEstablishmentValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('city')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Amenities must be an array'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array'),
  body('sports')
    .optional()
    .isArray()
    .withMessage('Sports must be an array')
];

// Update establishment validation
const updateEstablishmentValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  body('coordinates.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('coordinates.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('amenities')
    .optional()
    .isArray()
    .withMessage('Amenities must be an array'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array'),
  body('sports')
    .optional()
    .isArray()
    .withMessage('Sports must be an array')
];

// Query validation for search
const searchValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage('Rating must be between 0 and 5'),
  query('lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Radius must be between 0.1 and 100 km'),
  query('priceRange')
    .optional()
    .isIn(['$', '$$', '$$$'])
    .withMessage('Price range must be $, $$, or $$$')
];

// Public routes
router.get('/', searchValidation, handleValidationErrors, optionalAuth, getEstablishments);
router.get('/featured', optionalAuth, getFeaturedEstablishments);
router.get('/:id', optionalAuth, getEstablishmentById);

// Protected routes - require authentication
router.get('/my/establishments', authenticateToken, requireRole(['establishment', 'admin']), getMyEstablishments);
router.post('/', authenticateToken, requireRole(['establishment', 'admin']), createEstablishmentValidation, handleValidationErrors, createEstablishment);
router.put('/:id', authenticateToken, requireRole(['establishment', 'admin']), updateEstablishmentValidation, handleValidationErrors, updateEstablishment);
router.delete('/:id', authenticateToken, requireRole(['establishment', 'admin']), deleteEstablishment);

module.exports = router;
