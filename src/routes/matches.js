const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  getMatches,
  getMatchById,
  createMatch,
  joinMatch,
  leaveMatch,
  updateMatch,
  cancelMatch,
  getMyMatches
} = require('../controllers/matchController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Create match validation
const createMatchValidation = [
  body('sport').notEmpty().withMessage('Sport is required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid start time required'),
  body('maxPlayers').optional().isInt({ min: 2, max: 30 }).withMessage('Max players must be between 2 and 30')
];

// Public routes
router.get('/', optionalAuth, getMatches);
router.get('/:id', optionalAuth, getMatchById);

// Protected routes
router.use(authenticateToken);

router.get('/my/matches', getMyMatches);
router.post('/', createMatchValidation, handleValidationErrors, createMatch);
router.post('/:id/join', joinMatch);
router.post('/:id/leave', leaveMatch);
router.put('/:id', updateMatch);
router.delete('/:id', cancelMatch);

module.exports = router;
