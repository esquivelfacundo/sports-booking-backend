const { User, Booking, Favorite, Establishment, Review } = require('../models');
const { Op } = require('sequelize');

const getUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search,
      userType,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (userType) {
      where.userType = userType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'refreshToken'] },
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: users,
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

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [
        {
          model: Favorite,
          as: 'favorites',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'city', 'address', 'rating']
          }]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Error fetching user',
      message: error.message
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Only allow users to update their own profile (unless admin)
    if (req.user.id !== id && req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own profile'
      });
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Fields that can be updated
    const allowedFields = [
      'firstName', 'lastName', 'phone', 'city', 'province', 
      'postalCode', 'dateOfBirth', 'bio', 'profileImage',
      'favoritesSports', 'skillLevel', 'preferredTimes'
    ];

    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    await user.update(filteredUpdates);

    // Return updated user without sensitive fields
    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ['password', 'refreshToken'] }
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      error: 'Error updating user',
      message: error.message
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Only allow users to delete their own account (unless admin)
    if (req.user.id !== id && req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete your own account'
      });
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Soft delete
    await user.update({
      isActive: false,
      deletedAt: new Date()
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

const getUserBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      status,
      startDate,
      endDate
    } = req.query;

    // Only allow users to see their own bookings (unless admin)
    if (req.user.id !== id && req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own bookings'
      });
    }

    const offset = (page - 1) * limit;
    const where = { userId: id };

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.date = { ...where.date, [Op.gte]: startDate };
    }

    if (endDate) {
      where.date = { ...where.date, [Op.lte]: endDate };
    }

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city']
        }
      ],
      order: [['date', 'DESC'], ['startTime', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      error: 'Error fetching user bookings',
      message: error.message
    });
  }
};

const getUserFavorites = async (req, res) => {
  try {
    const { id } = req.params;

    // Only allow users to see their own favorites (unless admin)
    if (req.user.id !== id && req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own favorites'
      });
    }

    const favorites = await Favorite.findAll({
      where: { userId: id },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name', 'address', 'city', 'rating', 'reviewCount', 'images', 'sports']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: favorites.map(f => f.establishment)
    });
  } catch (error) {
    console.error('Error fetching user favorites:', error);
    res.status(500).json({
      error: 'Error fetching user favorites',
      message: error.message
    });
  }
};

const getUserReviews = async (req, res) => {
  try {
    const { id } = req.params;

    const reviews = await Review.findAll({
      where: { userId: id },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name', 'city']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({
      error: 'Error fetching user reviews',
      message: error.message
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserBookings,
  getUserFavorites,
  getUserReviews
};
