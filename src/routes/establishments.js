const express = require('express');
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const {
  createEstablishment,
  getEstablishments,
  getEstablishmentById,
  getEstablishmentBySlug,
  updateEstablishment,
  deleteEstablishment,
  getMyEstablishments,
  getFeaturedEstablishments
} = require('../controllers/establishmentController');
const { Establishment } = require('../models');

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
    .isLength({ min: 8, max: 20 })
    .withMessage('Phone must be between 8 and 20 characters'),
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

// Public routes (order matters - specific routes before parameterized routes)
router.get('/', searchValidation, handleValidationErrors, optionalAuth, getEstablishments);
router.get('/featured', optionalAuth, getFeaturedEstablishments);
router.get('/slug/:slug', optionalAuth, getEstablishmentBySlug);

// Protected routes - require authentication (must be before /:id to avoid being captured)
router.get('/me', authenticateToken, requireRole(['establishment', 'admin']), getMyEstablishments);
router.get('/my/establishments', authenticateToken, requireRole(['establishment', 'admin']), getMyEstablishments);
router.post('/', authenticateToken, requireRole(['establishment', 'admin']), createEstablishmentValidation, handleValidationErrors, createEstablishment);

// API Key management for WhatsApp bot integration
router.get('/:id/api-key', authenticateToken, requireRole(['establishment', 'admin']), async (req, res) => {
  try {
    const establishment = await Establishment.findByPk(req.params.id);
    if (!establishment) {
      return res.status(404).json({ success: false, error: 'Establishment not found' });
    }
    
    // Check ownership
    if (req.user.role !== 'admin' && establishment.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    res.json({
      success: true,
      data: {
        hasApiKey: !!establishment.apiKey,
        apiKey: establishment.apiKey || null
      }
    });
  } catch (error) {
    console.error('Error getting API key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/:id/api-key/generate', authenticateToken, requireRole(['establishment', 'admin']), async (req, res) => {
  try {
    const establishment = await Establishment.findByPk(req.params.id);
    if (!establishment) {
      return res.status(404).json({ success: false, error: 'Establishment not found' });
    }
    
    // Check ownership
    if (req.user.role !== 'admin' && establishment.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    // Generate new API key
    const apiKey = 'mc_' + crypto.randomBytes(32).toString('hex');
    await establishment.update({ apiKey });
    
    res.json({
      success: true,
      data: {
        apiKey,
        message: 'API Key generated successfully'
      }
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/:id/api-key', authenticateToken, requireRole(['establishment', 'admin']), async (req, res) => {
  try {
    const establishment = await Establishment.findByPk(req.params.id);
    if (!establishment) {
      return res.status(404).json({ success: false, error: 'Establishment not found' });
    }
    
    // Check ownership
    if (req.user.role !== 'admin' && establishment.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    await establishment.update({ apiKey: null });
    
    res.json({
      success: true,
      message: 'API Key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Parameterized routes (must be last)
router.get('/:id', optionalAuth, getEstablishmentById);
router.put('/:id', authenticateToken, requireRole(['establishment', 'admin']), updateEstablishmentValidation, handleValidationErrors, updateEstablishment);
router.delete('/:id', authenticateToken, requireRole(['establishment', 'admin']), deleteEstablishment);

module.exports = router;
