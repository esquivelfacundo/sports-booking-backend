/**
 * Integrations Routes
 * API endpoints for managing establishment integrations (OpenAI, WhatsApp)
 */
const express = require('express');
const router = express.Router();
const integrationsService = require('../services/integrations');
const ocrService = require('../services/ocr');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  }
});

/**
 * Helper to get establishmentId from user (staff or owner)
 */
async function getEstablishmentId(user) {
  // Staff users have establishmentId directly
  if (user.establishmentId) {
    return user.establishmentId;
  }
  
  // For establishment owners, find their establishment
  const { Establishment } = require('../models');
  const establishment = await Establishment.findOne({
    where: { userId: user.id },
    attributes: ['id']
  });
  
  return establishment?.id || null;
}

/**
 * Middleware to check if user is admin/owner (not regular staff)
 * Integrations should only be accessible by establishment owners or admin staff
 */
function requireAdminOrOwner(req, res, next) {
  // Staff with non-admin role cannot access integrations
  if (req.user.isStaff && req.user.staffRole !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'No tienes permiso para acceder a las integraciones. Solo administradores pueden gestionar integraciones.'
    });
  }
  next();
}

/**
 * GET /api/integrations
 * Get all integrations for the authenticated user's establishment
 * Only accessible by establishment owners/admins, not regular staff
 */
router.get('/', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    
    console.log(`[Integrations] User ${req.user.email} (isStaff: ${req.user.isStaff}) requesting integrations for establishment: ${establishmentId}`);
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const integrations = await integrationsService.findAll(establishmentId);
    
    console.log(`[Integrations] Found ${integrations.length} integrations for establishment ${establishmentId}`);
    
    res.json({
      success: true,
      data: integrations
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/integrations/:type
 * Get a specific integration by type
 */
router.get('/:type', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    const { type } = req.params;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const validTypes = ['OPENAI', 'WHATSAPP'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration type. Must be OPENAI or WHATSAPP'
      });
    }

    const integration = await integrationsService.findByType(establishmentId, type.toUpperCase());
    
    res.json({
      success: true,
      data: integration
    });
  } catch (error) {
    console.error('Error fetching integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/integrations
 * Create or update an integration
 */
router.post('/', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    const userId = req.user.id || req.user.odId;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const { type, apiKey, phoneNumberId, businessAccountId, verifyToken, config } = req.body;

    // Validate required fields
    if (!type || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Type and apiKey are required'
      });
    }

    const validTypes = ['OPENAI', 'WHATSAPP'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration type. Must be OPENAI or WHATSAPP'
      });
    }

    // WhatsApp requires phoneNumberId
    if (type.toUpperCase() === 'WHATSAPP' && !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumberId is required for WhatsApp integration'
      });
    }

    const integration = await integrationsService.upsert(establishmentId, userId, {
      type: type.toUpperCase(),
      apiKey,
      phoneNumberId,
      businessAccountId,
      verifyToken,
      config
    });
    
    res.json({
      success: true,
      data: integration,
      message: 'Integration saved successfully'
    });
  } catch (error) {
    console.error('Error saving integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/integrations/:type/test
 * Test an integration's connection
 */
router.post('/:type/test', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    const { type } = req.params;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const validTypes = ['OPENAI', 'WHATSAPP'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration type. Must be OPENAI or WHATSAPP'
      });
    }

    const result = await integrationsService.testConnection(establishmentId, type.toUpperCase());
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error testing integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/integrations/:type/toggle
 * Toggle an integration's active status
 */
router.patch('/:type/toggle', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    const userId = req.user.id || req.user.odId;
    const { type } = req.params;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const validTypes = ['OPENAI', 'WHATSAPP'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration type. Must be OPENAI or WHATSAPP'
      });
    }

    const integration = await integrationsService.toggle(establishmentId, type.toUpperCase(), userId);
    
    res.json({
      success: true,
      data: integration,
      message: `Integration ${integration.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/integrations/:type
 * Delete an integration
 */
router.delete('/:type', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    const { type } = req.params;
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    const validTypes = ['OPENAI', 'WHATSAPP'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration type. Must be OPENAI or WHATSAPP'
      });
    }

    await integrationsService.delete(establishmentId, type.toUpperCase());
    
    res.json({
      success: true,
      message: 'Integration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/integrations/ocr/process
 * Process an image with OCR to extract invoice data
 */
router.post('/ocr/process', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const establishmentId = await getEstablishmentId(req.user);
    
    if (!establishmentId) {
      return res.status(400).json({
        success: false,
        error: 'No establishment associated with this user'
      });
    }

    // Check if image was uploaded
    if (!req.file && !req.body.imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'No image provided. Upload a file or send imageBase64 in body.'
      });
    }

    // Get image data
    let imageData;
    if (req.file) {
      imageData = req.file.buffer;
    } else {
      imageData = req.body.imageBase64;
    }

    const result = await ocrService.processImage(establishmentId, imageData);
    
    res.json({
      success: result.success,
      data: result.data,
      confidence: result.confidence,
      warnings: result.warnings,
      processingTimeMs: result.processingTimeMs,
      error: result.error
    });
  } catch (error) {
    console.error('Error processing OCR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
