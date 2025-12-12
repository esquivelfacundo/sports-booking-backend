const { Favorite, Establishment, User } = require('../models');

const getFavorites = async (req, res) => {
  try {
    const userId = req.user.id;

    const favorites = await Favorite.findAll({
      where: { userId },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: [
          'id', 'name', 'address', 'city', 'phone', 'email',
          'rating', 'reviewCount', 'images', 'sports', 'amenities',
          'priceRange', 'isActive'
        ]
      }],
      order: [['createdAt', 'DESC']]
    });

    // Filter out inactive establishments and return only establishment data
    const activeEstablishments = favorites
      .filter(f => f.establishment && f.establishment.isActive)
      .map(f => ({
        ...f.establishment.toJSON(),
        favoritedAt: f.createdAt
      }));

    res.json({
      success: true,
      data: activeEstablishments,
      total: activeEstablishments.length
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({
      error: 'Error fetching favorites',
      message: error.message
    });
  }
};

const addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { establishmentId } = req.body;

    // Check if establishment exists
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({
      where: { userId, establishmentId }
    });

    if (existingFavorite) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Establishment already in favorites'
      });
    }

    // Create favorite
    const favorite = await Favorite.create({
      userId,
      establishmentId
    });

    res.status(201).json({
      success: true,
      message: 'Added to favorites',
      data: {
        id: favorite.id,
        establishmentId,
        createdAt: favorite.createdAt
      }
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({
      error: 'Error adding favorite',
      message: error.message
    });
  }
};

const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { establishmentId } = req.params;

    const favorite = await Favorite.findOne({
      where: { userId, establishmentId }
    });

    if (!favorite) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Favorite not found'
      });
    }

    await favorite.destroy();

    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({
      error: 'Error removing favorite',
      message: error.message
    });
  }
};

const checkFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { establishmentId } = req.params;

    const favorite = await Favorite.findOne({
      where: { userId, establishmentId }
    });

    res.json({
      success: true,
      isFavorite: !!favorite,
      data: favorite ? {
        id: favorite.id,
        createdAt: favorite.createdAt
      } : null
    });
  } catch (error) {
    console.error('Error checking favorite:', error);
    res.status(500).json({
      error: 'Error checking favorite',
      message: error.message
    });
  }
};

const toggleFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { establishmentId } = req.params;

    // Check if establishment exists
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({
      where: { userId, establishmentId }
    });

    if (existingFavorite) {
      // Remove favorite
      await existingFavorite.destroy();
      return res.json({
        success: true,
        action: 'removed',
        isFavorite: false,
        message: 'Removed from favorites'
      });
    } else {
      // Add favorite
      const favorite = await Favorite.create({
        userId,
        establishmentId
      });
      return res.json({
        success: true,
        action: 'added',
        isFavorite: true,
        message: 'Added to favorites',
        data: {
          id: favorite.id,
          createdAt: favorite.createdAt
        }
      });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({
      error: 'Error toggling favorite',
      message: error.message
    });
  }
};

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  toggleFavorite
};
