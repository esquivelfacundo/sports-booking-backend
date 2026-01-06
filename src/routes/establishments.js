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
const { sequelize } = require('../config/database');

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

// Registration wizard endpoint - handles the full registration flow
router.post('/register', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = req.user.id;
    const {
      basicInfo,
      location,
      schedule,
      amenities,
      images,
      courts,
      staff,
      representative
    } = req.body;

    // Check if user already has an establishment
    const existingEstablishment = await Establishment.findOne({
      where: { userId },
      transaction
    });

    if (existingEstablishment) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ya tienes un establecimiento registrado'
      });
    }

    // Extract coordinates from location
    const latitude = location?.coordinates?.lat || null;
    const longitude = location?.coordinates?.lng || null;

    // Validate required fields
    const establishmentName = basicInfo?.name?.trim();
    const establishmentAddress = location?.address?.trim();
    const establishmentCity = location?.city?.trim();

    if (!establishmentName) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'El nombre del establecimiento es requerido'
      });
    }

    if (!establishmentAddress) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'La dirección del establecimiento es requerida'
      });
    }

    if (!establishmentCity) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'La ciudad del establecimiento es requerida'
      });
    }

    // Generate unique slug from name
    const baseSlug = establishmentName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Check for existing slug and make unique if needed
    let slug = baseSlug;
    let slugCounter = 1;
    let existingSlug = await Establishment.findOne({ where: { slug }, transaction });
    while (existingSlug) {
      slug = `${baseSlug}-${slugCounter}`;
      slugCounter++;
      existingSlug = await Establishment.findOne({ where: { slug }, transaction });
    }

    // Create the establishment
    const establishment = await Establishment.create({
      userId,
      name: establishmentName,
      slug,
      description: basicInfo?.description || '',
      phone: basicInfo?.phone || '',
      email: basicInfo?.email || '',
      address: establishmentAddress,
      city: establishmentCity,
      latitude,
      longitude,
      amenities: amenities || [],
      sports: req.body.sports || [],
      openingHours: schedule || {},
      images: images?.photos || [],
      isActive: true,
      isVerified: false,
      // Add default booking configuration
      requireDeposit: true,
      depositType: 'percentage',
      depositPercentage: 50,
      allowFullPayment: false,
      maxAdvanceBookingDays: 30,
      minAdvanceBookingHours: 2,
      allowSameDayBooking: true,
      cancellationDeadlineHours: 24,
      cancellationPolicy: 'partial_refund',
      refundPercentage: 50,
      noShowPenalty: true,
      noShowPenaltyType: 'deposit_only'
    }, { transaction });

    // Create courts if provided
    if (courts && courts.length > 0) {
      const { Court } = require('../models');
      
      // Map frontend surface types to backend ENUM values
      const surfaceMap = {
        'synthetic': 'synthetic',
        'grass': 'grass',
        'clay': 'clay',
        'cement': 'hard',
        'wood': 'indoor',
        'hard': 'hard',
        'indoor': 'indoor',
        'outdoor': 'outdoor'
      };
      
      for (const court of courts) {
        const mappedSurface = surfaceMap[court.surfaceType] || 'synthetic';
        await Court.create({
          establishmentId: establishment.id,
          name: court.name,
          sport: court.sport,
          surface: mappedSurface,
          isIndoor: court.isIndoor || false,
          pricePerHour: court.pricePerHour || 0,
          isActive: true
        }, { transaction });
      }
    }

    // Update user role to establishment if not already
    const { User } = require('../models');
    await User.update(
      { userType: 'establishment' },
      { where: { id: userId }, transaction }
    );

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Establecimiento registrado exitosamente',
      establishment: {
        id: establishment.id,
        name: establishment.name,
        slug: establishment.slug
      },
      status: 'pending_verification'
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error registering establishment:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      success: false,
      message: 'Error al registrar el establecimiento',
      error: error.message,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Get establishment profile (for owners to check PIN status)
router.get('/my/profile', authenticateToken, requireRole(['establishment', 'admin']), async (req, res) => {
  try {
    const establishment = await Establishment.findOne({
      where: { userId: req.user.id }
    });
    
    if (!establishment) {
      return res.status(404).json({ success: false, error: 'Establishment not found' });
    }
    
    res.json({
      success: true,
      profile: {
        id: establishment.id,
        name: establishment.name,
        hasPin: !!establishment.pin
      }
    });
  } catch (error) {
    console.error('Error getting establishment profile:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update establishment profile (including PIN)
router.put('/my/profile', authenticateToken, requireRole(['establishment', 'admin']), async (req, res) => {
  try {
    const establishment = await Establishment.findOne({
      where: { userId: req.user.id }
    });
    
    if (!establishment) {
      return res.status(404).json({ success: false, error: 'Establishment not found' });
    }
    
    const { pin, currentPin } = req.body;
    
    // Update PIN if provided
    if (pin !== undefined) {
      if (pin === null || pin === '') {
        await establishment.update({ pin: null });
      } else if (/^[0-9]{4}$/.test(pin)) {
        // If establishment already has a PIN, require currentPin to change it
        if (establishment.pin && currentPin !== establishment.pin) {
          return res.status(401).json({
            success: false,
            error: 'Invalid current PIN',
            message: 'El PIN actual es incorrecto'
          });
        }
        await establishment.update({ pin });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid PIN format',
          message: 'El PIN debe ser de 4 dígitos'
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Perfil actualizado correctamente'
    });
  } catch (error) {
    console.error('Error updating establishment profile:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

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
