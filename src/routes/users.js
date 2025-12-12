const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserBookings,
  getUserFavorites,
  getUserReviews
} = require('../controllers/userController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all users (admin only)
router.get('/', requireRole(['admin', 'superadmin']), getUsers);

// Get user by ID
router.get('/:id', getUserById);

// Update user
router.put('/:id', updateUser);

// Delete user
router.delete('/:id', deleteUser);

// Get user's bookings
router.get('/:id/bookings', getUserBookings);

// Get user's favorites
router.get('/:id/favorites', getUserFavorites);

// Get user's reviews
router.get('/:id/reviews', getUserReviews);

module.exports = router;
