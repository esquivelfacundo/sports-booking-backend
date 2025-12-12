const { Tournament, User, Establishment } = require('../models');
const { Op } = require('sequelize');

const getTournaments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      sport,
      city,
      status,
      startDate,
      endDate
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (sport) {
      where.sport = { [Op.iLike]: `%${sport}%` };
    }

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.startDate = { [Op.gte]: startDate };
    }

    if (endDate) {
      where.endDate = { [Op.lte]: endDate };
    }

    const { count, rows: tournaments } = await Tournament.findAndCountAll({
      where,
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city', 'images'],
          where: city ? { city: { [Op.iLike]: `%${city}%` } } : undefined
        },
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'profileImage']
        }
      ],
      order: [['startDate', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: tournaments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    res.status(500).json({
      error: 'Error fetching tournaments',
      message: error.message
    });
  }
};

const getTournamentById = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findByPk(id, {
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city', 'phone', 'email', 'images']
        },
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'profileImage', 'phone', 'email']
        }
      ]
    });

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    res.json({
      success: true,
      data: tournament
    });
  } catch (error) {
    console.error('Error fetching tournament:', error);
    res.status(500).json({
      error: 'Error fetching tournament',
      message: error.message
    });
  }
};

const createTournament = async (req, res) => {
  try {
    const organizerId = req.user.id;
    const {
      establishmentId,
      name,
      description,
      sport,
      format,
      startDate,
      endDate,
      registrationDeadline,
      maxTeams,
      minTeams,
      teamSize,
      entryFee,
      prizePool,
      rules,
      skillLevel
    } = req.body;

    // Validate establishment exists
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    const tournament = await Tournament.create({
      organizerId,
      establishmentId,
      name,
      description,
      sport,
      format: format || 'single_elimination',
      startDate,
      endDate,
      registrationDeadline,
      maxTeams: maxTeams || 16,
      minTeams: minTeams || 4,
      currentTeams: 0,
      teamSize: teamSize || 5,
      entryFee: entryFee || 0,
      prizePool: prizePool || 0,
      rules,
      skillLevel: skillLevel || 'all',
      status: 'registration_open'
    });

    const createdTournament = await Tournament.findByPk(tournament.id, {
      include: [
        { model: Establishment, as: 'establishment' },
        { model: User, as: 'organizer', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Tournament created successfully',
      data: createdTournament
    });
  } catch (error) {
    console.error('Error creating tournament:', error);
    res.status(500).json({
      error: 'Error creating tournament',
      message: error.message
    });
  }
};

const updateTournament = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const tournament = await Tournament.findByPk(id);

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    // Only organizer or admin can update
    if (tournament.organizerId !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the organizer can update this tournament'
      });
    }

    const allowedFields = [
      'name', 'description', 'startDate', 'endDate', 'registrationDeadline',
      'maxTeams', 'minTeams', 'teamSize', 'entryFee', 'prizePool',
      'rules', 'skillLevel', 'status', 'format'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    await tournament.update(filteredUpdates);

    res.json({
      success: true,
      message: 'Tournament updated successfully',
      data: tournament
    });
  } catch (error) {
    console.error('Error updating tournament:', error);
    res.status(500).json({
      error: 'Error updating tournament',
      message: error.message
    });
  }
};

const deleteTournament = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const tournament = await Tournament.findByPk(id);

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    // Only organizer or admin can delete
    if (tournament.organizerId !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the organizer can delete this tournament'
      });
    }

    // Soft delete by changing status
    await tournament.update({ status: 'cancelled' });

    res.json({
      success: true,
      message: 'Tournament cancelled successfully'
    });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    res.status(500).json({
      error: 'Error deleting tournament',
      message: error.message
    });
  }
};

const registerForTournament = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { teamName, players } = req.body;

    const tournament = await Tournament.findByPk(id);

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    if (tournament.status !== 'registration_open') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Registration is not open for this tournament'
      });
    }

    if (tournament.currentTeams >= tournament.maxTeams) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Tournament is full'
      });
    }

    // Check registration deadline
    if (new Date() > new Date(tournament.registrationDeadline)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Registration deadline has passed'
      });
    }

    // Store registration in tournament's participants JSON field
    const participants = tournament.participants || [];
    
    // Check if already registered
    if (participants.some(p => p.userId === userId)) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'You are already registered for this tournament'
      });
    }

    participants.push({
      userId: userId,
      teamName: teamName || `Team ${participants.length + 1}`,
      players: players || [],
      registeredAt: new Date(),
      status: 'registered'
    });

    await tournament.update({
      participants,
      currentTeams: tournament.currentTeams + 1
    });

    // Check if tournament is now full
    if (tournament.currentTeams + 1 >= tournament.maxTeams) {
      await tournament.update({ status: 'registration_closed' });
    }

    res.json({
      success: true,
      message: 'Successfully registered for tournament'
    });
  } catch (error) {
    console.error('Error registering for tournament:', error);
    res.status(500).json({
      error: 'Error registering for tournament',
      message: error.message
    });
  }
};

const getTournamentParticipants = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findByPk(id, {
      attributes: ['id', 'name', 'participants', 'currentTeams', 'maxTeams']
    });

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    res.json({
      success: true,
      data: {
        participants: tournament.participants || [],
        currentTeams: tournament.currentTeams,
        maxTeams: tournament.maxTeams
      }
    });
  } catch (error) {
    console.error('Error fetching tournament participants:', error);
    res.status(500).json({
      error: 'Error fetching participants',
      message: error.message
    });
  }
};

const getTournamentBrackets = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findByPk(id, {
      attributes: ['id', 'name', 'format', 'brackets', 'status']
    });

    if (!tournament) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tournament not found'
      });
    }

    res.json({
      success: true,
      data: {
        format: tournament.format,
        brackets: tournament.brackets || [],
        status: tournament.status
      }
    });
  } catch (error) {
    console.error('Error fetching tournament brackets:', error);
    res.status(500).json({
      error: 'Error fetching brackets',
      message: error.message
    });
  }
};

module.exports = {
  getTournaments,
  getTournamentById,
  createTournament,
  updateTournament,
  deleteTournament,
  registerForTournament,
  getTournamentParticipants,
  getTournamentBrackets
};
