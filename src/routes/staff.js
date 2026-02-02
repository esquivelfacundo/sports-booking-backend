const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  staffLogin,
  getAvailableSections,
  validatePin,
  getMyProfile,
  updateMyProfile
} = require('../controllers/staffController');

const router = express.Router();

// Public route for staff login
router.post('/login', staffLogin);

// Get available sections (public for reference)
router.get('/sections', getAvailableSections);

// Protected routes for current user (any authenticated staff)
router.post('/validate-pin', authenticateToken, validatePin);
router.get('/me', authenticateToken, getMyProfile);
router.put('/me', authenticateToken, updateMyProfile);

// Protected routes - require admin authentication
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get all staff for an establishment
router.get('/establishment/:establishmentId', getStaff);

// Create a new staff member
router.post('/establishment/:establishmentId', createStaff);

// Update a staff member
router.put('/establishment/:establishmentId/:staffId', updateStaff);

// Delete a staff member
router.delete('/establishment/:establishmentId/:staffId', deleteStaff);

module.exports = router;
