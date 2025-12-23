const express = require('express');
const router = express.Router();

const oauthRoutes = require('./oauth');
const paymentsRoutes = require('./payments');
const webhooksRoutes = require('./webhooks');
const platformRoutes = require('./platform');

// Mount routes
router.use('/oauth', oauthRoutes);
router.use('/payments', paymentsRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/platform', platformRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mercadopago',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Info endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'Mercado Pago Integration',
    version: '1.0.0',
    endpoints: {
      oauth: {
        authorize: 'GET /api/mp/oauth/authorize',
        callback: 'GET /api/mp/oauth/callback',
        refresh: 'POST /api/mp/oauth/refresh',
        disconnect: 'DELETE /api/mp/oauth/disconnect/:establishmentId',
        status: 'GET /api/mp/oauth/status/:establishmentId'
      },
      payments: {
        createPreference: 'POST /api/mp/payments/create-preference',
        createSplitPreference: 'POST /api/mp/payments/create-split-preference',
        getPayment: 'GET /api/mp/payments/:paymentId',
        calculateFee: 'POST /api/mp/payments/calculate-fee'
      },
      platform: {
        getConfig: 'GET /api/mp/platform/config',
        updateConfig: 'PUT /api/mp/platform/config',
        mpStatus: 'GET /api/mp/platform/mp-status',
        disconnect: 'DELETE /api/mp/platform/disconnect',
        setEstablishmentFee: 'PUT /api/mp/platform/establishment-fee/:establishmentId',
        getEstablishments: 'GET /api/mp/platform/establishments'
      },
      webhooks: {
        receive: 'POST /api/mp/webhooks'
      }
    }
  });
});

module.exports = router;
