const { User, Establishment, Court, Booking, Payment, Review, ClientDebt, Client, sequelize } = require('../models');
const { Op } = require('sequelize');

// ==================== ESTABLISHMENTS ====================

const getAllEstablishments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      city, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build where clause
    const where = {};
    
    if (status) {
      where.registrationStatus = status;
    }
    
    if (city) {
      where.city = { [Op.iLike]: `%${city}%` };
    }
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: establishments } = await Establishment.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Court,
          as: 'courts',
          attributes: ['id', 'name', 'sport', 'pricePerHour']
        }
      ],
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Get booking counts per establishment
    const bookingCounts = await Booking.findAll({
      attributes: [
        'establishmentId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")), 'completedBookings'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END")), 'cancelledBookings'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalRevenue'],
        [sequelize.fn('SUM', sequelize.col('depositAmount')), 'totalDeposits']
      ],
      group: ['establishmentId'],
      raw: true
    });

    // Get platform default fee
    const { PlatformConfig } = require('../models');
    const platformConfig = await PlatformConfig.findOne();
    const defaultFeePercent = platformConfig?.defaultFeePercent || 10;

    const bookingCountMap = {};
    bookingCounts.forEach(bc => {
      bookingCountMap[bc.establishmentId] = {
        totalBookings: parseInt(bc.totalBookings) || 0,
        completedBookings: parseInt(bc.completedBookings) || 0,
        cancelledBookings: parseInt(bc.cancelledBookings) || 0,
        totalRevenue: parseFloat(bc.totalRevenue) || 0,
        totalDeposits: parseFloat(bc.totalDeposits) || 0
      };
    });

    // Transform data for frontend
    const transformedEstablishments = establishments.map(est => {
      const bookingStats = bookingCountMap[est.id] || { totalBookings: 0, completedBookings: 0, cancelledBookings: 0, totalRevenue: 0, totalDeposits: 0 };
      // Calculate commission: use custom fee if set, otherwise default
      // Commission is calculated on totalRevenue (court price x hours), NOT on deposits
      const feePercent = est.customFeePercent !== null ? parseFloat(est.customFeePercent) : defaultFeePercent;
      const commissionsGenerated = Math.round(bookingStats.totalRevenue * (feePercent / 100) * 100) / 100;
      
      return {
        id: est.id,
        name: est.name,
        city: est.city,
        email: est.email,
        registrationStatus: est.registrationStatus,
        createdAt: est.createdAt,
        address: est.address,
        phone: est.phone,
        description: est.description,
        amenities: est.amenities || [],
        sports: est.sports || [],
        rating: est.rating || 0,
        reviewCount: est.reviewCount || 0,
        isActive: est.isActive,
        owner: est.owner,
        courtsCount: est.courts?.length || 0,
        customFeePercent: est.customFeePercent,
        effectiveFeePercent: feePercent,
        mpConnected: !!est.mpAccessToken,
        // Stats
        totalBookings: bookingStats.totalBookings,
        completedBookings: bookingStats.completedBookings,
        cancelledBookings: bookingStats.cancelledBookings,
        totalRevenue: bookingStats.totalRevenue,
        totalDeposits: bookingStats.totalDeposits,
        commissionsGenerated: commissionsGenerated
      };
    });

    res.json({
      success: true,
      data: transformedEstablishments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching establishments:', error);
    res.status(500).json({
      error: 'Error fetching establishments',
      message: error.message
    });
  }
};

const approveEstablishment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    await establishment.update({
      registrationStatus: 'approved',
      isActive: true,
      approvedAt: new Date(),
      approvedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Establishment approved successfully',
      data: establishment
    });
  } catch (error) {
    console.error('Error approving establishment:', error);
    res.status(500).json({
      error: 'Error approving establishment',
      message: error.message
    });
  }
};

const rejectEstablishment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    await establishment.update({
      registrationStatus: 'rejected',
      isActive: false,
      rejectionReason: reason,
      rejectedAt: new Date(),
      rejectedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Establishment rejected',
      data: establishment
    });
  } catch (error) {
    console.error('Error rejecting establishment:', error);
    res.status(500).json({
      error: 'Error rejecting establishment',
      message: error.message
    });
  }
};

const updateEstablishmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be approved, pending, or rejected'
      });
    }
    
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    const updateData = {
      registrationStatus: status,
      isActive: status === 'approved'
    };

    if (status === 'approved') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = req.user.id;
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = req.user.id;
      if (reason) updateData.rejectionReason = reason;
    }

    await establishment.update(updateData);

    res.json({
      success: true,
      message: `Establishment status changed to ${status}`,
      data: establishment
    });
  } catch (error) {
    console.error('Error updating establishment status:', error);
    res.status(500).json({
      error: 'Error updating establishment status',
      message: error.message
    });
  }
};

const deleteEstablishmentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('[deleteEstablishmentAdmin] Attempting to delete establishment:', id);
    
    const establishment = await Establishment.findByPk(id);
    
    if (!establishment) {
      console.log('[deleteEstablishmentAdmin] Establishment not found:', id);
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    console.log('[deleteEstablishmentAdmin] Found establishment:', establishment.name);

    // Delete associated courts first (foreign key constraint)
    const deletedCourts = await Court.destroy({
      where: { establishmentId: id }
    });
    console.log('[deleteEstablishmentAdmin] Deleted courts:', deletedCourts);

    // Delete associated reviews
    const deletedReviews = await Review.destroy({
      where: { establishmentId: id }
    });
    console.log('[deleteEstablishmentAdmin] Deleted reviews:', deletedReviews);

    // Hard delete the establishment
    await establishment.destroy();
    console.log('[deleteEstablishmentAdmin] Establishment deleted successfully');

    res.json({
      success: true,
      message: 'Establishment deleted successfully'
    });
  } catch (error) {
    console.error('[deleteEstablishmentAdmin] Error deleting establishment:', error);
    res.status(500).json({
      error: 'Error deleting establishment',
      message: error.message
    });
  }
};

// ==================== USERS ====================

const getAllUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build where clause
    const where = {};
    
    if (role) {
      where.userType = role;
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'refreshToken'] },
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Transform data for frontend
    const transformedUsers = users.map(user => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      createdAt: user.createdAt,
      isActive: user.isActive,
      role: user.userType,
      phone: user.phone,
      city: user.city
    }));

    res.json({
      success: true,
      data: transformedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Error fetching users',
      message: error.message
    });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Prevent suspending admins
    if (user.userType === 'admin' || user.userType === 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot suspend admin users'
      });
    }

    await user.update({
      isActive: false,
      suspendedAt: new Date(),
      suspendedBy: req.user.id,
      suspensionReason: reason
    });

    res.json({
      success: true,
      message: 'User suspended successfully'
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({
      error: 'Error suspending user',
      message: error.message
    });
  }
};

const activateUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    await user.update({
      isActive: true,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null
    });

    res.json({
      success: true,
      message: 'User activated successfully'
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({
      error: 'Error activating user',
      message: error.message
    });
  }
};

const deleteUserAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Prevent deleting admins
    if (user.userType === 'admin' || user.userType === 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete admin users'
      });
    }

    // If it's an establishment user, also deactivate their establishment
    if (user.userType === 'establishment') {
      const establishment = await Establishment.findOne({
        where: { userId: user.id }
      });
      
      if (establishment) {
        await establishment.update({
          isActive: false,
          registrationStatus: 'rejected'
        });
      }
    }

    // Soft delete user
    await user.update({
      isActive: false,
      deletedAt: new Date(),
      deletedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      error: 'Error deleting user',
      message: error.message
    });
  }
};

// ==================== STATS ====================

const getPlatformStats = async (req, res) => {
  try {
    // Get establishment stats
    const totalEstablishments = await Establishment.count();
    const approvedEstablishments = await Establishment.count({
      where: { registrationStatus: 'approved' }
    });
    const pendingEstablishments = await Establishment.count({
      where: { registrationStatus: 'pending' }
    });
    const rejectedEstablishments = await Establishment.count({
      where: { registrationStatus: 'rejected' }
    });

    // Get user stats
    const totalUsers = await User.count();
    const activeUsers = await User.count({
      where: { isActive: true }
    });
    const playerUsers = await User.count({
      where: { userType: 'player' }
    });
    const establishmentUsers = await User.count({
      where: { userType: 'establishment' }
    });

    // Get booking stats
    const totalBookings = await Booking.count();
    const confirmedBookings = await Booking.count({
      where: { status: 'confirmed' }
    });
    const completedBookings = await Booking.count({
      where: { status: 'completed' }
    });
    const cancelledBookings = await Booking.count({
      where: { status: 'cancelled' }
    });

    // Get payment stats (may not exist yet)
    let totalPayments = 0;
    let completedPayments = 0;
    let totalRevenue = 0;
    try {
      if (Payment) {
        totalPayments = await Payment.count();
        completedPayments = await Payment.count({
          where: { status: 'completed' }
        });
        const revenueResult = await Payment.sum('amount', {
          where: { status: 'completed' }
        });
        totalRevenue = revenueResult || 0;
      }
    } catch (e) {
      console.log('Payment table not available:', e.message);
    }

    // Get court stats
    const totalCourts = await Court.count();

    // Get review stats (may not exist yet)
    let totalReviews = 0;
    try {
      if (Review) {
        totalReviews = await Review.count();
      }
    } catch (e) {
      console.log('Review table not available:', e.message);
    }

    res.json({
      success: true,
      data: {
        establishments: {
          total: totalEstablishments,
          approved: approvedEstablishments,
          pending: pendingEstablishments,
          rejected: rejectedEstablishments
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          players: playerUsers,
          establishments: establishmentUsers
        },
        bookings: {
          total: totalBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings
        },
        payments: {
          total: totalPayments,
          completed: completedPayments,
          totalRevenue: totalRevenue
        },
        courts: {
          total: totalCourts
        },
        reviews: {
          total: totalReviews
        },
        // Legacy format for frontend compatibility
        totalEstablishments,
        approvedEstablishments,
        pendingEstablishments,
        totalUsers,
        totalReservations: totalBookings,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({
      error: 'Error fetching platform stats',
      message: error.message
    });
  }
};

// Get all players (registered users) + clients (establishment contacts) combined
const getAllPlayersAndClients = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search,
      registered, // 'all', 'yes', 'no'
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * parseInt(limit);
    const results = [];

    // 1. Get registered users (players)
    const userWhere = { userType: 'player' };
    if (search) {
      userWhere[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const users = await User.findAll({
      where: userWhere,
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'isActive', 'createdAt'],
      order: [[sortBy, sortOrder]]
    });

    // Transform users
    users.forEach(user => {
      results.push({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        createdAt: user.createdAt,
        isRegistered: true,
        source: 'user',
        establishmentName: null
      });
    });

    // 2. Get clients (establishment contacts)
    const clientWhere = {};
    if (search) {
      clientWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const clients = await Client.findAll({
      where: clientWhere,
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name']
      }],
      order: [[sortBy, sortOrder]]
    });

    // Transform clients
    clients.forEach(client => {
      results.push({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        isActive: client.isActive,
        createdAt: client.createdAt,
        isRegistered: false,
        source: 'client',
        establishmentId: client.establishmentId,
        establishmentName: client.establishment?.name || null,
        totalBookings: client.totalBookings,
        totalSpent: client.totalSpent
      });
    });

    // Filter by registered status if specified
    let filteredResults = results;
    if (registered === 'yes') {
      filteredResults = results.filter(r => r.isRegistered);
    } else if (registered === 'no') {
      filteredResults = results.filter(r => !r.isRegistered);
    }

    // Sort combined results
    filteredResults.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (sortOrder === 'DESC') {
        return bVal > aVal ? 1 : -1;
      }
      return aVal > bVal ? 1 : -1;
    });

    // Paginate
    const total = filteredResults.length;
    const paginatedResults = filteredResults.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: paginatedResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching players and clients:', error);
    res.status(500).json({
      error: 'Error fetching players and clients',
      message: error.message
    });
  }
};

module.exports = {
  // Establishments
  getAllEstablishments,
  approveEstablishment,
  rejectEstablishment,
  updateEstablishmentStatus,
  deleteEstablishmentAdmin,
  // Users
  getAllUsers,
  getAllPlayersAndClients,
  suspendUser,
  activateUser,
  deleteUserAdmin,
  // Stats
  getPlatformStats
};
