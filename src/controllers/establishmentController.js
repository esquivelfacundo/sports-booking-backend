const { Establishment, Court, Review, User, Favorite } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

const createEstablishment = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      description,
      address,
      city,
      coordinates,
      phone,
      email,
      website,
      amenities,
      rules,
      openingHours,
      sports
    } = req.body;

    const establishment = await Establishment.create({
      userId,
      name,
      description,
      address,
      city,
      latitude: coordinates ? coordinates.lat : null,
      longitude: coordinates ? coordinates.lng : null,
      phone,
      email,
      website,
      amenities: amenities || [],
      rules: rules || [],
      openingHours: openingHours || {},
      sports: sports || []
    });

    res.status(201).json({
      message: 'Establishment created successfully',
      establishment
    });

  } catch (error) {
    console.error('Create establishment error:', error);
    res.status(500).json({
      error: 'Failed to create establishment',
      message: 'An error occurred while creating the establishment'
    });
  }
};

const getEstablishments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      city,
      sport,
      search,
      minRating,
      priceRange,
      lat,
      lng,
      radius = 10
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { isActive: true };

    // City filter
    if (city) {
      where.city = { [Op.iLike]: `%${city}%` };
    }

    // Sport filter
    if (sport) {
      where.sports = { [Op.contains]: [sport] };
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Rating filter
    if (minRating) {
      where.rating = { [Op.gte]: parseFloat(minRating) };
    }

    // Price range filter
    if (priceRange) {
      where.priceRange = priceRange;
    }

    // Location-based search using Haversine formula
    if (lat && lng) {
      const radiusInKm = parseFloat(radius);
      const latFloat = parseFloat(lat);
      const lngFloat = parseFloat(lng);
      
      // Simple bounding box filter (more efficient than Haversine for initial filtering)
      const latDelta = radiusInKm / 111; // Approximate km per degree latitude
      const lngDelta = radiusInKm / (111 * Math.cos(latFloat * Math.PI / 180)); // Adjust for longitude
      
      where[Op.and] = [
        { latitude: { [Op.ne]: null } },
        { longitude: { [Op.ne]: null } },
        { latitude: { [Op.between]: [latFloat - latDelta, latFloat + latDelta] } },
        { longitude: { [Op.between]: [lngFloat - lngDelta, lngFloat + lngDelta] } }
      ];
    }

    const { count, rows: establishments } = await Establishment.findAndCountAll({
      where,
      include: [
        {
          model: Court,
          as: 'courts',
          where: { isActive: true },
          required: false
        },
        {
          model: Review,
          as: 'reviews',
          limit: 3,
          order: [['createdAt', 'DESC']],
          include: [{
            model: User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'profileImage']
          }],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['rating', 'DESC'], ['createdAt', 'DESC']]
    });

    // Add favorite status if user is authenticated
    let establishmentsWithFavorites = establishments;
    if (req.user) {
      const favoriteIds = await Favorite.findAll({
        where: { userId: req.user.id },
        attributes: ['establishmentId']
      }).then(favorites => favorites.map(f => f.establishmentId));

      establishmentsWithFavorites = establishments.map(est => ({
        ...est.toJSON(),
        isFavorite: favoriteIds.includes(est.id)
      }));
    }

    res.json({
      establishments: establishmentsWithFavorites,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get establishments error:', error);
    res.status(500).json({
      error: 'Failed to fetch establishments',
      message: 'An error occurred while fetching establishments'
    });
  }
};

const getEstablishmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const establishment = await Establishment.findOne({
      where: { id, isActive: true },
      include: [
        {
          model: Court,
          as: 'courts',
          where: { isActive: true },
          required: false
        },
        {
          model: Review,
          as: 'reviews',
          include: [{
            model: User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'profileImage']
          }],
          order: [['createdAt', 'DESC']]
        },
        {
          model: User,
          as: 'owner',
          attributes: ['firstName', 'lastName', 'email', 'phone']
        }
      ]
    });

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'The requested establishment does not exist'
      });
    }

    // Add favorite status if user is authenticated
    let establishmentResponse = establishment.toJSON();
    if (req.user) {
      const favorite = await Favorite.findOne({
        where: { userId: req.user.id, establishmentId: id }
      });
      establishmentResponse.isFavorite = !!favorite;
    }

    res.json({ establishment: establishmentResponse });

  } catch (error) {
    console.error('Get establishment error:', error);
    res.status(500).json({
      error: 'Failed to fetch establishment',
      message: 'An error occurred while fetching the establishment'
    });
  }
};

const updateEstablishment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const establishment = await Establishment.findOne({
      where: { id, userId }
    });

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have permission to update it'
      });
    }

    const updateData = req.body;
    
    // Handle coordinates update
    if (updateData.coordinates) {
      updateData.coordinates = {
        type: 'Point',
        coordinates: [updateData.coordinates.lng, updateData.coordinates.lat]
      };
    }

    await establishment.update(updateData);

    res.json({
      message: 'Establishment updated successfully',
      establishment
    });

  } catch (error) {
    console.error('Update establishment error:', error);
    res.status(500).json({
      error: 'Failed to update establishment',
      message: 'An error occurred while updating the establishment'
    });
  }
};

const deleteEstablishment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const establishment = await Establishment.findOne({
      where: { id, userId }
    });

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have permission to delete it'
      });
    }

    // Soft delete by setting isActive to false
    await establishment.update({ isActive: false });

    res.json({
      message: 'Establishment deleted successfully'
    });

  } catch (error) {
    console.error('Delete establishment error:', error);
    res.status(500).json({
      error: 'Failed to delete establishment',
      message: 'An error occurred while deleting the establishment'
    });
  }
};

const getMyEstablishments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: establishments } = await Establishment.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Court,
          as: 'courts',
          required: false
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      establishments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get my establishments error:', error);
    res.status(500).json({
      error: 'Failed to fetch establishments',
      message: 'An error occurred while fetching your establishments'
    });
  }
};

const getFeaturedEstablishments = async (req, res) => {
  try {
    const { limit = 6, city } = req.query;
    const where = { isActive: true, isVerified: true };

    if (city) {
      where.city = { [Op.iLike]: `%${city}%` };
    }

    const establishments = await Establishment.findAll({
      where,
      include: [
        {
          model: Court,
          as: 'courts',
          where: { isActive: true },
          required: false,
          limit: 1
        }
      ],
      order: [['rating', 'DESC'], ['totalReviews', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({ establishments });

  } catch (error) {
    console.error('Get featured establishments error:', error);
    res.status(500).json({
      error: 'Failed to fetch featured establishments',
      message: 'An error occurred while fetching featured establishments'
    });
  }
};

module.exports = {
  createEstablishment,
  getEstablishments,
  getEstablishmentById,
  updateEstablishment,
  deleteEstablishment,
  getMyEstablishments,
  getFeaturedEstablishments
};
