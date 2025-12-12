const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/auth');
const {
  getTournaments,
  getTournamentById,
  createTournament,
  updateTournament,
  deleteTournament,
  registerForTournament,
  getTournamentParticipants,
  getTournamentBrackets
} = require('../controllers/tournamentController');

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

// Create tournament validation
const createTournamentValidation = [
  body('establishmentId').isUUID().withMessage('Valid establishment ID required'),
  body('name').notEmpty().isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
  body('sport').notEmpty().withMessage('Sport is required'),
  body('startDate').isISO8601().withMessage('Valid start date required'),
  body('endDate').isISO8601().withMessage('Valid end date required'),
  body('maxTeams').optional().isInt({ min: 2, max: 128 }).withMessage('Max teams must be 2-128')
];

// Public routes
router.get('/', optionalAuth, getTournaments);
router.get('/:id', optionalAuth, getTournamentById);
router.get('/:id/participants', optionalAuth, getTournamentParticipants);
router.get('/:id/brackets', optionalAuth, getTournamentBrackets);

// Protected routes
router.post('/', authenticateToken, requireRole(['establishment', 'admin']), createTournamentValidation, handleValidationErrors, createTournament);
router.put('/:id', authenticateToken, updateTournament);
router.delete('/:id', authenticateToken, deleteTournament);
router.post('/:id/register', authenticateToken, registerForTournament);

module.exports = router;
