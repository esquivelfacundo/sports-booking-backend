const { Client, Establishment, ClientDebt, Booking, sequelize } = require('../models');
const { Op } = require('sequelize');

// Helper function to verify establishment access (includes staff)
const verifyEstablishmentAccess = async (req, establishmentId) => {
  const isAdmin = req.user.userType === 'admin';
  const isStaff = req.user.isStaff && req.user.establishmentId === establishmentId;
  
  if (isAdmin || isStaff) {
    return await Establishment.findByPk(establishmentId);
  }
  
  return await Establishment.findOne({
    where: { id: establishmentId, userId: req.user.id }
  });
};

// Search clients
const searchClients = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { q, limit = 10 } = req.query;
    
    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    const where = { 
      establishmentId,
      isActive: true
    };

    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { phone: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } }
      ];
    }

    const clients = await Client.findAll({
      where,
      limit: parseInt(limit),
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: clients
    });

  } catch (error) {
    console.error('Search clients error:', error);
    res.status(500).json({
      error: 'Failed to search clients',
      message: 'An error occurred while searching clients'
    });
  }
};

// Get all clients for establishment
const getClients = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    const { count, rows: clients } = await Client.findAndCountAll({
      where: { establishmentId, isActive: true },
      limit: parseInt(limit),
      offset,
      order: [['name', 'ASC']]
    });

    // Get booking stats and debt info for each client
    const clientIds = clients.map(c => c.id);
    const clientEmails = clients.map(c => c.email).filter(Boolean);

    // Get booking stats per client
    const bookingStats = await Booking.findAll({
      attributes: [
        'clientId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")), 'completedBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'pending' OR status = 'confirmed' THEN 1 ELSE 0 END")), 'pendingBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END")), 'cancelledBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'no_show' THEN 1 ELSE 0 END")), 'noShowBookings'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
        [sequelize.fn('MAX', sequelize.col('date')), 'lastBookingDate'],
        [sequelize.fn('MAX', sequelize.literal("CASE WHEN status = 'completed' THEN date ELSE NULL END")), 'lastCompletedBookingDate']
      ],
      where: {
        establishmentId,
        clientId: { [Op.in]: clientIds }
      },
      group: ['clientId'],
      raw: true
    });

    const bookingStatsMap = {};
    bookingStats.forEach(stat => {
      bookingStatsMap[stat.clientId] = stat;
    });

    // Get pending debts per client email
    const debts = await ClientDebt.findAll({
      attributes: [
        'clientEmail',
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalDebt']
      ],
      where: {
        establishmentId,
        clientEmail: { [Op.in]: clientEmails },
        status: 'pending'
      },
      group: ['clientEmail'],
      raw: true
    });

    const debtMap = {};
    debts.forEach(debt => {
      debtMap[debt.clientEmail?.toLowerCase()] = parseFloat(debt.totalDebt) || 0;
    });

    // Enrich clients with stats and debt info
    const enrichedClients = clients.map(client => {
      const stats = bookingStatsMap[client.id] || {};
      const debtAmount = client.email ? (debtMap[client.email.toLowerCase()] || 0) : 0;
      
      return {
        ...client.toJSON(),
        totalBookings: parseInt(stats.totalBookings) || 0,
        completedBookings: parseInt(stats.completedBookings) || 0,
        pendingBookings: parseInt(stats.pendingBookings) || 0,
        cancelledBookings: parseInt(stats.cancelledBookings) || 0,
        noShowBookings: parseInt(stats.noShowBookings) || 0,
        totalSpent: parseFloat(stats.totalSpent) || 0,
        lastBookingDate: stats.lastBookingDate || null,
        lastCompletedBookingDate: stats.lastCompletedBookingDate || null,
        hasDebt: debtAmount > 0,
        debtAmount: debtAmount
      };
    });

    res.json({
      success: true,
      data: enrichedClients,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      error: 'Failed to fetch clients',
      message: 'An error occurred while fetching clients'
    });
  }
};

// Create client
const createClient = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { name, phone, email, notes } = req.body;
    
    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    // Check if client with same phone already exists
    if (phone) {
      const existingClient = await Client.findOne({
        where: { establishmentId, phone }
      });
      
      if (existingClient) {
        return res.status(409).json({
          error: 'Client already exists',
          message: 'A client with this phone number already exists',
          client: existingClient
        });
      }
    }

    const client = await Client.create({
      establishmentId,
      name,
      phone,
      email,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: client
    });

  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({
      error: 'Failed to create client',
      message: 'An error occurred while creating the client'
    });
  }
};

// Update client
const updateClient = async (req, res) => {
  try {
    const { establishmentId, clientId } = req.params;
    const updateData = req.body;
    
    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    const client = await Client.findOne({
      where: { id: clientId, establishmentId }
    });

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: 'Client not found'
      });
    }

    await client.update(updateData);

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: client
    });

  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      error: 'Failed to update client',
      message: 'An error occurred while updating the client'
    });
  }
};

// Delete client (soft delete)
const deleteClient = async (req, res) => {
  try {
    const { establishmentId, clientId } = req.params;
    
    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    const client = await Client.findOne({
      where: { id: clientId, establishmentId }
    });

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: 'Client not found'
      });
    }

    await client.update({ isActive: false });

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });

  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      error: 'Failed to delete client',
      message: 'An error occurred while deleting the client'
    });
  }
};

module.exports = {
  searchClients,
  getClients,
  createClient,
  updateClient,
  deleteClient
};
