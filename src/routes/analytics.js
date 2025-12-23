const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getEstablishmentAnalytics,
  getTopCustomers
} = require('../controllers/analyticsController');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get comprehensive analytics for an establishment
router.get('/establishment/:establishmentId', getEstablishmentAnalytics);

// Get top customers
router.get('/establishment/:establishmentId/top-customers', getTopCustomers);

module.exports = router;
