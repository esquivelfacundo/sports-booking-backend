const { Review, User, Establishment, Court, Booking } = require('../models');
const { Op } = require('sequelize');

const getEstablishmentReviews = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await Review.findAndCountAll({
      where: { establishmentId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }],
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate average rating
    const avgResult = await Review.findOne({
      where: { establishmentId },
      attributes: [
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'totalReviews']
      ],
      raw: true
    });

    res.json({
      success: true,
      data: reviews,
      stats: {
        averageRating: parseFloat(avgResult?.averageRating || 0).toFixed(1),
        totalReviews: parseInt(avgResult?.totalReviews || 0)
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching establishment reviews:', error);
    res.status(500).json({
      error: 'Error fetching reviews',
      message: error.message
    });
  }
};

const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'profileImage']
        },
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'city']
        }
      ]
    });

    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({
      error: 'Error fetching review',
      message: error.message
    });
  }
};

const createReview = async (req, res) => {
  try {
    const { establishmentId, courtId, bookingId, rating, comment, aspects } = req.body;
    const userId = req.user.id;

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if establishment exists
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Establishment not found'
      });
    }

    // Check if user already reviewed this establishment (optional: allow multiple reviews)
    const existingReview = await Review.findOne({
      where: { userId, establishmentId }
    });

    if (existingReview) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'You have already reviewed this establishment'
      });
    }

    // Create review
    const review = await Review.create({
      userId,
      establishmentId,
      courtId: courtId || null,
      bookingId: bookingId || null,
      rating,
      comment,
      aspects: aspects || {},
      isVerified: !!bookingId // Verified if linked to a booking
    });

    // Update establishment rating
    const avgResult = await Review.findOne({
      where: { establishmentId },
      attributes: [
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'totalReviews']
      ],
      raw: true
    });

    await establishment.update({
      rating: parseFloat(avgResult.averageRating).toFixed(1),
      reviewCount: parseInt(avgResult.totalReviews)
    });

    // Fetch created review with user info
    const createdReview = await Review.findByPk(review.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: createdReview
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      error: 'Error creating review',
      message: error.message
    });
  }
};

const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, aspects } = req.body;
    const userId = req.user.id;

    const review = await Review.findByPk(id);

    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Review not found'
      });
    }

    // Only allow owner to update
    if (review.userId !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own reviews'
      });
    }

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Rating must be between 1 and 5'
      });
    }

    await review.update({
      rating: rating !== undefined ? rating : review.rating,
      comment: comment !== undefined ? comment : review.comment,
      aspects: aspects !== undefined ? aspects : review.aspects
    });

    // Update establishment rating
    const avgResult = await Review.findOne({
      where: { establishmentId: review.establishmentId },
      attributes: [
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'totalReviews']
      ],
      raw: true
    });

    await Establishment.update(
      {
        rating: parseFloat(avgResult.averageRating).toFixed(1),
        reviewCount: parseInt(avgResult.totalReviews)
      },
      { where: { id: review.establishmentId } }
    );

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      error: 'Error updating review',
      message: error.message
    });
  }
};

const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const review = await Review.findByPk(id);

    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Review not found'
      });
    }

    // Only allow owner or admin to delete
    if (review.userId !== userId && req.user.userType !== 'admin' && req.user.userType !== 'superadmin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete your own reviews'
      });
    }

    const establishmentId = review.establishmentId;
    await review.destroy();

    // Update establishment rating
    const avgResult = await Review.findOne({
      where: { establishmentId },
      attributes: [
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'totalReviews']
      ],
      raw: true
    });

    await Establishment.update(
      {
        rating: avgResult?.averageRating ? parseFloat(avgResult.averageRating).toFixed(1) : 0,
        reviewCount: parseInt(avgResult?.totalReviews || 0)
      },
      { where: { id: establishmentId } }
    );

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      error: 'Error deleting review',
      message: error.message
    });
  }
};

const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;

    const reviews = await Review.findAll({
      where: { userId },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'name', 'city', 'address']
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
  getEstablishmentReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews
};
