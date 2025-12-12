const { AvailableMatch, MatchParticipant, User, Court, Establishment } = require('../models');
const { Op } = require('sequelize');

const getMatches = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      sport,
      city,
      date,
      status = 'open',
      skillLevel
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (sport) {
      where.sport = { [Op.iLike]: `%${sport}%` };
    }

    if (skillLevel) {
      where.skillLevel = skillLevel;
    }

    if (date) {
      where.date = date;
    }

    // Only show future matches
    where.date = { ...where.date, [Op.gte]: new Date().toISOString().split('T')[0] };

    const { count, rows: matches } = await AvailableMatch.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'profileImage', 'skillLevel']
        },
        {
          model: Court,
          as: 'court',
          attributes: ['id', 'name', 'sport', 'surface'],
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city'],
            where: city ? { city: { [Op.iLike]: `%${city}%` } } : undefined
          }]
        },
        {
          model: MatchParticipant,
          as: 'participants',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'profileImage']
          }]
        }
      ],
      order: [['date', 'ASC'], ['startTime', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: matches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({
      error: 'Error fetching matches',
      message: error.message
    });
  }
};

const getMatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const match = await AvailableMatch.findByPk(id, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'profileImage', 'skillLevel', 'phone']
        },
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city', 'phone', 'images']
          }]
        },
        {
          model: MatchParticipant,
          as: 'participants',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'profileImage', 'skillLevel']
          }]
        }
      ]
    });

    if (!match) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Match not found'
      });
    }

    res.json({
      success: true,
      data: match
    });
  } catch (error) {
    console.error('Error fetching match:', error);
    res.status(500).json({
      error: 'Error fetching match',
      message: error.message
    });
  }
};

const createMatch = async (req, res) => {
  try {
    const organizerId = req.user.id;
    const {
      courtId,
      establishmentId,
      sport,
      date,
      startTime,
      endTime,
      maxPlayers,
      minPlayers,
      pricePerPlayer,
      skillLevel,
      description,
      isPrivate = false
    } = req.body;

    // Validate court exists
    if (courtId) {
      const court = await Court.findByPk(courtId);
      if (!court) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Court not found'
        });
      }
    }

    const match = await AvailableMatch.create({
      organizerId,
      courtId,
      establishmentId,
      sport,
      date,
      startTime,
      endTime,
      maxPlayers: maxPlayers || 10,
      minPlayers: minPlayers || 2,
      currentPlayers: 1, // Organizer counts as first player
      pricePerPlayer: pricePerPlayer || 0,
      skillLevel: skillLevel || 'all',
      description,
      isPrivate,
      status: 'open'
    });

    // Add organizer as first participant
    await MatchParticipant.create({
      matchId: match.id,
      userId: organizerId,
      status: 'confirmed',
      isOrganizer: true
    });

    // Fetch created match with relations
    const createdMatch = await AvailableMatch.findByPk(match.id, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'profileImage']
        },
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city']
          }]
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: createdMatch
    });
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({
      error: 'Error creating match',
      message: error.message
    });
  }
};

const joinMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const match = await AvailableMatch.findByPk(id);

    if (!match) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Match not found'
      });
    }

    if (match.status !== 'open') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Match is not open for joining'
      });
    }

    if (match.currentPlayers >= match.maxPlayers) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Match is full'
      });
    }

    // Check if already joined
    const existingParticipant = await MatchParticipant.findOne({
      where: { matchId: id, userId: userId }
    });

    if (existingParticipant) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'You have already joined this match'
      });
    }

    // Add participant
    await MatchParticipant.create({
      matchId: id,
      userId: userId,
      status: 'confirmed',
      isOrganizer: false
    });

    // Update player count
    await match.update({
      currentPlayers: match.currentPlayers + 1
    });

    // Check if match is now full
    if (match.currentPlayers + 1 >= match.maxPlayers) {
      await match.update({ status: 'full' });
    }

    res.json({
      success: true,
      message: 'Successfully joined the match'
    });
  } catch (error) {
    console.error('Error joining match:', error);
    res.status(500).json({
      error: 'Error joining match',
      message: error.message
    });
  }
};

const leaveMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const match = await AvailableMatch.findByPk(id);

    if (!match) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Match not found'
      });
    }

    // Cannot leave if you're the organizer
    if (match.organizerId === userId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Organizer cannot leave the match. Cancel it instead.'
      });
    }

    const participant = await MatchParticipant.findOne({
      where: { matchId: id, userId: userId }
    });

    if (!participant) {
      return res.status(404).json({
        error: 'Not found',
        message: 'You are not a participant of this match'
      });
    }

    await participant.destroy();

    // Update player count
    await match.update({
      currentPlayers: Math.max(0, match.currentPlayers - 1),
      status: 'open' // Reopen if was full
    });

    res.json({
      success: true,
      message: 'Successfully left the match'
    });
  } catch (error) {
    console.error('Error leaving match:', error);
    res.status(500).json({
      error: 'Error leaving match',
      message: error.message
    });
  }
};

const updateMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const match = await AvailableMatch.findByPk(id);

    if (!match) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Match not found'
      });
    }

    // Only organizer or admin can update
    if (match.organizerId !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the organizer can update this match'
      });
    }

    const allowedFields = [
      'date', 'startTime', 'endTime', 'maxPlayers', 'minPlayers',
      'pricePerPlayer', 'skillLevel', 'description', 'status'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    await match.update(filteredUpdates);

    res.json({
      success: true,
      message: 'Match updated successfully',
      data: match
    });
  } catch (error) {
    console.error('Error updating match:', error);
    res.status(500).json({
      error: 'Error updating match',
      message: error.message
    });
  }
};

const cancelMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const match = await AvailableMatch.findByPk(id);

    if (!match) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Match not found'
      });
    }

    // Only organizer or admin can cancel
    if (match.organizerId !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the organizer can cancel this match'
      });
    }

    await match.update({ status: 'cancelled' });

    // TODO: Notify all participants about cancellation

    res.json({
      success: true,
      message: 'Match cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling match:', error);
    res.status(500).json({
      error: 'Error cancelling match',
      message: error.message
    });
  }
};

const getMyMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all' } = req.query; // 'organized', 'joined', 'all'

    let matches = [];

    if (type === 'organized' || type === 'all') {
      const organized = await AvailableMatch.findAll({
        where: { organizerId: userId },
        include: [
          { model: Court, as: 'court' },
          { model: MatchParticipant, as: 'participants' }
        ],
        order: [['date', 'DESC']]
      });
      matches = [...matches, ...organized.map(m => ({ ...m.toJSON(), role: 'organizer' }))];
    }

    if (type === 'joined' || type === 'all') {
      const participations = await MatchParticipant.findAll({
        where: { userId: userId, isOrganizer: false },
        include: [{
          model: AvailableMatch,
          as: 'match',
          include: [
            { model: User, as: 'organizer', attributes: ['id', 'firstName', 'lastName'] },
            { model: Court, as: 'court' }
          ]
        }]
      });
      const joined = participations.map(p => ({ ...p.match.toJSON(), role: 'participant' }));
      matches = [...matches, ...joined];
    }

    // Sort by date
    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: matches
    });
  } catch (error) {
    console.error('Error fetching my matches:', error);
    res.status(500).json({
      error: 'Error fetching matches',
      message: error.message
    });
  }
};

module.exports = {
  getMatches,
  getMatchById,
  createMatch,
  joinMatch,
  leaveMatch,
  updateMatch,
  cancelMatch,
  getMyMatches
};
