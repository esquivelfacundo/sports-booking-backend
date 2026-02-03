const express = require('express');
const router = express.Router();
const mpService = require('../../services/mercadopago');
const { Establishment, PlatformConfig } = require('../../models');
const { authenticateToken } = require('../../middleware/auth');

/**
 * GET /api/mp/oauth/authorize
 * Redirects to Mercado Pago for OAuth authorization
 * Query params:
 *   - establishmentId: ID of the establishment to connect (required for establishments)
 *   - type: 'establishment' or 'platform' (default: 'establishment')
 *   - redirectUrl: URL to redirect after callback (optional)
 */
router.get('/authorize', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, type = 'establishment', redirectUrl } = req.query;
    const userId = req.user.id;

    // Validate establishment ownership if connecting establishment
    if (type === 'establishment') {
      if (!establishmentId) {
        return res.status(400).json({ error: 'establishmentId is required' });
      }

      const establishment = await Establishment.findOne({
        where: { id: establishmentId, userId }
      });

      if (!establishment) {
        return res.status(404).json({ error: 'Establishment not found or not owned by user' });
      }
    }

    // For platform connection, check if user is admin
    if (type === 'platform') {
      if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only admins can connect platform account' });
      }
    }

    // Create state with info for callback
    const state = Buffer.from(JSON.stringify({
      type,
      establishmentId: establishmentId || null,
      userId,
      redirectUrl: redirectUrl || `${mpService.config.frontendUrl}/establecimientos/admin/configuracion`,
      timestamp: Date.now(),
    })).toString('base64');

    const callbackUrl = `${mpService.config.appUrl}/api/mp/oauth/callback`;
    const authUrl = mpService.getAuthorizationUrl(callbackUrl, state);

    res.json({ authUrl });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

/**
 * GET /api/mp/oauth/callback
 * Callback from Mercado Pago after authorization
 */
router.get('/callback', async (req, res) => {
  const { code, error, state } = req.query;

  // Decode state
  let stateData = { redirectUrl: mpService.config.frontendUrl };
  try {
    if (state) {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    }
  } catch (err) {
    console.error('Error decoding state:', err.message);
  }

  const redirectUrl = stateData.redirectUrl || mpService.config.frontendUrl;

  if (error) {
    console.error('❌ OAuth authorization error:', error);
    return res.redirect(`${redirectUrl}?mp_status=error&mp_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${redirectUrl}?mp_status=error&mp_error=no_code`);
  }

  try {
    const callbackUrl = `${mpService.config.appUrl}/api/mp/oauth/callback`;
    const tokenData = await mpService.exchangeCodeForToken(code, callbackUrl);

    console.log('✅ MP account connected:', tokenData.userId);

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));

    // Save based on type
    if (stateData.type === 'platform') {
      // Save platform admin account
      await PlatformConfig.updateMPCredentials({
        userId: tokenData.userId,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        publicKey: tokenData.publicKey,
        expiresAt,
        email: null // Could fetch from MP API if needed
      });

      console.log('✅ Platform MP account connected');
    } else {
      // Save establishment account
      const establishment = await Establishment.findByPk(stateData.establishmentId);
      
      if (establishment) {
        await establishment.update({
          mpUserId: tokenData.userId,
          mpAccessToken: tokenData.accessToken,
          mpRefreshToken: tokenData.refreshToken,
          mpPublicKey: tokenData.publicKey,
          mpTokenExpiresAt: expiresAt,
          mpConnectedAt: new Date(),
          mpActive: true
        });

        console.log('✅ Establishment MP account connected:', establishment.name);
      }
    }

    // Redirect with success
    res.redirect(`${redirectUrl}?mp_status=success&mp_user_id=${tokenData.userId}`);

  } catch (err) {
    console.error('❌ Error exchanging code:', err.message);
    res.redirect(`${redirectUrl}?mp_status=error&mp_error=${encodeURIComponent(err.message)}`);
  }
});

/**
 * POST /api/mp/oauth/refresh
 * Refresh access token for an establishment
 * Body: { establishmentId: string }
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.body;
    const userId = req.user.id;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    const establishment = await Establishment.findOne({
      where: { id: establishmentId, userId }
    });

    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (!establishment.mpRefreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const newTokens = await mpService.refreshAccessToken(establishment.mpRefreshToken);

    const expiresAt = new Date(Date.now() + (newTokens.expiresIn * 1000));

    await establishment.update({
      mpAccessToken: newTokens.accessToken,
      mpRefreshToken: newTokens.refreshToken || establishment.mpRefreshToken,
      mpTokenExpiresAt: expiresAt
    });

    res.json({
      success: true,
      expiresIn: newTokens.expiresIn,
    });

  } catch (err) {
    console.error('❌ Error refreshing token:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/mp/oauth/disconnect/:establishmentId
 * Disconnect MP account from establishment
 */
router.delete('/disconnect/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const userId = req.user.id;

    const establishment = await Establishment.findOne({
      where: { id: establishmentId, userId }
    });

    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    await establishment.update({
      mpUserId: null,
      mpAccessToken: null,
      mpRefreshToken: null,
      mpPublicKey: null,
      mpTokenExpiresAt: null,
      mpEmail: null,
      mpConnectedAt: null,
      mpActive: false
    });

    res.json({ success: true, message: 'MP account disconnected' });

  } catch (err) {
    console.error('❌ Error disconnecting:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mp/oauth/status/:establishmentId
 * Get MP connection status for an establishment
 */
router.get('/status/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const establishment = await Establishment.findByPk(establishmentId, {
      attributes: ['id', 'userId', 'mpUserId', 'mpEmail', 'mpConnectedAt', 'mpActive', 'mpTokenExpiresAt', 'customFeePercent']
    });

    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Check ownership or staff
    const isOwner = establishment.userId === req.user.id;
    const isStaff = req.user.isStaff && req.user.establishmentId === establishment.id;
    if (!isOwner && !isStaff && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const isConnected = !!(establishment.mpUserId && establishment.mpActive);
    const isTokenExpired = establishment.mpTokenExpiresAt && new Date(establishment.mpTokenExpiresAt) < new Date();

    res.json({
      success: true,
      connected: isConnected,
      mpUserId: establishment.mpUserId,
      mpEmail: establishment.mpEmail,
      connectedAt: establishment.mpConnectedAt,
      tokenExpired: isTokenExpired,
      customFeePercent: establishment.customFeePercent
    });

  } catch (err) {
    console.error('❌ Error getting status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
