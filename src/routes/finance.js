const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getFinancialSummary,
  getPendingPayments,
  getSalesByProductAndPaymentMethod
} = require('../controllers/financeController');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get financial summary for an establishment
router.get('/establishment/:establishmentId', getFinancialSummary);

// Get pending payments
router.get('/establishment/:establishmentId/pending', getPendingPayments);

// Get sales by product and payment method
router.get('/establishment/:establishmentId/sales-by-product', getSalesByProductAndPaymentMethod);

module.exports = router;
