const express = require('express');
const router = express.Router();
const { PlatformConfig, Establishment } = require('../../models');
const { authenticateToken } = require('../../middleware/auth');
const mpService = require('../../services/mercadopago');

/**
 * Middleware to check if user is admin/superadmin
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/mp/platform/config
 * Get platform configuration (admin only)
 */
router.get('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = await PlatformConfig.getConfig();

    res.json({
      success: true,
      config: {
        defaultFeePercent: parseFloat(config.defaultFeePercent),
        mpConnected: !!(config.mpUserId && config.mpAccessToken),
        mpUserId: config.mpUserId,
        mpEmail: config.mpEmail,
        mpConnectedAt: config.mpConnectedAt,
        settings: config.settings
      }
    });

  } catch (err) {
    console.error('Error getting platform config:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/mp/platform/config
 * Update platform configuration (admin only)
 */
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { defaultFeePercent, settings } = req.body;

    const config = await PlatformConfig.getConfig();

    const updates = {};

    if (defaultFeePercent !== undefined) {
      const fee = parseFloat(defaultFeePercent);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return res.status(400).json({ error: 'Invalid fee percent (must be 0-100)' });
      }
      updates.defaultFeePercent = fee;
    }

    if (settings !== undefined) {
      updates.settings = { ...config.settings, ...settings };
    }

    await config.update(updates);

    res.json({
      success: true,
      message: 'Platform configuration updated',
      config: {
        defaultFeePercent: parseFloat(config.defaultFeePercent),
        settings: config.settings
      }
    });

  } catch (err) {
    console.error('Error updating platform config:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mp/platform/mp-status
 * Get platform MP connection status (admin only)
 */
router.get('/mp-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = await PlatformConfig.getConfig();

    const isConnected = !!(config.mpUserId && config.mpAccessToken);
    const isTokenExpired = config.mpTokenExpiresAt && new Date(config.mpTokenExpiresAt) < new Date();

    res.json({
      success: true,
      connected: isConnected,
      mpUserId: config.mpUserId,
      mpEmail: config.mpEmail,
      connectedAt: config.mpConnectedAt,
      tokenExpired: isTokenExpired
    });

  } catch (err) {
    console.error('Error getting MP status:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/mp/platform/disconnect
 * Disconnect platform MP account (admin only)
 */
router.delete('/disconnect', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = await PlatformConfig.getConfig();

    await config.update({
      mpUserId: null,
      mpAccessToken: null,
      mpRefreshToken: null,
      mpPublicKey: null,
      mpEmail: null,
      mpTokenExpiresAt: null,
      mpConnectedAt: null
    });

    res.json({
      success: true,
      message: 'Platform MP account disconnected'
    });

  } catch (err) {
    console.error('Error disconnecting platform MP:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/mp/platform/establishment-fee/:establishmentId
 * Set custom fee for a specific establishment (admin only)
 */
router.put('/establishment-fee/:establishmentId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { customFeePercent } = req.body;

    const establishment = await Establishment.findByPk(establishmentId);

    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Validate fee
    if (customFeePercent !== null && customFeePercent !== undefined) {
      const fee = parseFloat(customFeePercent);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return res.status(400).json({ error: 'Invalid fee percent (must be 0-100 or null)' });
      }
      await establishment.update({ customFeePercent: fee });
    } else {
      // Reset to use platform default
      await establishment.update({ customFeePercent: null });
    }

    res.json({
      success: true,
      message: 'Establishment fee updated',
      establishmentId,
      customFeePercent: establishment.customFeePercent
    });

  } catch (err) {
    console.error('Error updating establishment fee:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mp/platform/establishments
 * Get all establishments with their MP status and fees (admin only)
 */
router.get('/establishments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const establishments = await Establishment.findAll({
      where: { isActive: true },
      attributes: [
        'id', 'name', 'slug', 
        'mpUserId', 'mpEmail', 'mpActive', 'mpConnectedAt',
        'customFeePercent'
      ],
      order: [['name', 'ASC']]
    });

    const platformConfig = await PlatformConfig.getConfig();
    const defaultFeePercent = parseFloat(platformConfig.defaultFeePercent);

    const result = establishments.map(est => ({
      id: est.id,
      name: est.name,
      slug: est.slug,
      mpConnected: est.mpActive,
      mpUserId: est.mpUserId,
      mpEmail: est.mpEmail,
      mpConnectedAt: est.mpConnectedAt,
      customFeePercent: est.customFeePercent,
      effectiveFeePercent: est.customFeePercent !== null ? parseFloat(est.customFeePercent) : defaultFeePercent
    }));

    res.json({
      success: true,
      defaultFeePercent,
      establishments: result
    });

  } catch (err) {
    console.error('Error getting establishments:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
