const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  searchClients,
  getClients,
  createClient,
  updateClient,
  deleteClient
} = require('../controllers/clientController');

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

// Create client validation
const createClientValidation = [
  body('name')
    .notEmpty()
    .withMessage('Client name is required')
    .isLength({ max: 100 })
    .withMessage('Name must not exceed 100 characters'),
  body('phone')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Phone must not exceed 20 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
];

// Routes
router.get(
  '/establishment/:establishmentId/search',
  authenticateToken,
  searchClients
);

router.get(
  '/establishment/:establishmentId',
  authenticateToken,
  getClients
);

router.post(
  '/establishment/:establishmentId',
  authenticateToken,
  createClientValidation,
  handleValidationErrors,
  createClient
);

router.put(
  '/establishment/:establishmentId/:clientId',
  authenticateToken,
  updateClient
);

router.delete(
  '/establishment/:establishmentId/:clientId',
  authenticateToken,
  deleteClient
);

module.exports = router;
