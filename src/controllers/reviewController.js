const { Review, User, Establishment, Court, Booking, Client } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

// Generate unique review token for a booking
const generateReviewToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

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

// Get booking info by review token (public - no auth required)
const getBookingByReviewToken = async (req, res) => {
  try {
    const { token } = req.params;

    const booking = await Booking.findOne({
      where: { reviewToken: token },
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'logo', 'address', 'city']
        },
        {
          model: Court,
          as: 'court',
          attributes: ['id', 'name', 'sport']
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Invalid or expired review link'
      });
    }

    // Check if already reviewed
    if (booking.reviewedAt) {
      return res.status(400).json({
        error: 'Already reviewed',
        message: 'This booking has already been reviewed'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        error: 'Not eligible',
        message: 'Only completed bookings can be reviewed'
      });
    }

    res.json({
      success: true,
      data: {
        bookingId: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        establishment: booking.establishment,
        court: booking.court,
        clientName: booking.clientName
      }
    });
  } catch (error) {
    console.error('Error fetching booking by review token:', error);
    res.status(500).json({
      error: 'Error fetching booking',
      message: error.message
    });
  }
};

// Create review via unique token (public - no auth required)
const createReviewByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { rating, comment, aspects, npsScore, source = 'qr_ticket' } = req.body;

    // Find booking by token
    const booking = await Booking.findOne({
      where: { reviewToken: token },
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'user' }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Invalid or expired review link'
      });
    }

    // Check if already reviewed
    if (booking.reviewedAt) {
      return res.status(400).json({
        error: 'Already reviewed',
        message: 'This booking has already been reviewed'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        error: 'Not eligible',
        message: 'Only completed bookings can be reviewed'
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Rating must be between 1 and 5'
      });
    }

    // Determine userId from booking
    const userId = booking.userId || (booking.client?.userId) || null;

    // Create review
    const review = await Review.create({
      userId,
      establishmentId: booking.establishmentId,
      courtId: booking.courtId,
      bookingId: booking.id,
      rating,
      comment,
      aspects: aspects || {},
      npsScore: npsScore || null,
      source,
      isVerified: true, // Always verified since it comes from a valid booking token
      isAnonymous: !userId // Anonymous if no user linked
    });

    // Mark booking as reviewed
    await booking.update({ reviewedAt: new Date() });

    // Update establishment rating
    const avgResult = await Review.findOne({
      where: { establishmentId: booking.establishmentId },
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
      { where: { id: booking.establishmentId } }
    );

    res.status(201).json({
      success: true,
      message: 'Thank you for your review!',
      data: review
    });
  } catch (error) {
    console.error('Error creating review by token:', error);
    res.status(500).json({
      error: 'Error creating review',
      message: error.message
    });
  }
};

// Generate review token for a booking
const generateBookingReviewToken = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Booking not found'
      });
    }

    // Generate token if not exists
    if (!booking.reviewToken) {
      const token = generateReviewToken();
      await booking.update({ reviewToken: token });
      booking.reviewToken = token;
    }

    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:4555'}/valorar/${booking.reviewToken}`;

    res.json({
      success: true,
      data: {
        token: booking.reviewToken,
        url: reviewUrl,
        bookingId: booking.id
      }
    });
  } catch (error) {
    console.error('Error generating review token:', error);
    res.status(500).json({
      error: 'Error generating review token',
      message: error.message
    });
  }
};

// Get review statistics for an establishment
const getEstablishmentReviewStats = async (req, res) => {
  try {
    const { establishmentId } = req.params;

    // Overall stats
    const overallStats = await Review.findOne({
      where: { establishmentId, isHidden: false },
      attributes: [
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'totalReviews'],
        [Review.sequelize.fn('AVG', Review.sequelize.col('npsScore')), 'averageNps']
      ],
      raw: true
    });

    // Rating distribution
    const ratingDistribution = await Review.findAll({
      where: { establishmentId, isHidden: false },
      attributes: [
        'rating',
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'count']
      ],
      group: ['rating'],
      raw: true
    });

    // Format rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingDistribution.forEach(r => {
      distribution[r.rating] = parseInt(r.count);
    });

    // NPS calculation (Promoters: 9-10, Passives: 7-8, Detractors: 0-6)
    const npsData = await Review.findAll({
      where: { 
        establishmentId, 
        isHidden: false,
        npsScore: { [Op.not]: null }
      },
      attributes: ['npsScore'],
      raw: true
    });

    let promoters = 0, passives = 0, detractors = 0;
    npsData.forEach(r => {
      if (r.npsScore >= 9) promoters++;
      else if (r.npsScore >= 7) passives++;
      else detractors++;
    });

    const totalNpsResponses = npsData.length;
    const npsScore = totalNpsResponses > 0 
      ? Math.round(((promoters - detractors) / totalNpsResponses) * 100)
      : null;

    // Reviews by source
    const sourceDistribution = await Review.findAll({
      where: { establishmentId, isHidden: false },
      attributes: [
        'source',
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'count']
      ],
      group: ['source'],
      raw: true
    });

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Review.findAll({
      where: { 
        establishmentId, 
        isHidden: false,
        createdAt: { [Op.gte]: sixMonthsAgo }
      },
      attributes: [
        [Review.sequelize.fn('DATE_TRUNC', 'month', Review.sequelize.col('createdAt')), 'month'],
        [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'averageRating'],
        [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'count']
      ],
      group: [Review.sequelize.fn('DATE_TRUNC', 'month', Review.sequelize.col('createdAt'))],
      order: [[Review.sequelize.fn('DATE_TRUNC', 'month', Review.sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    // Response rate (reviews vs completed bookings)
    const completedBookings = await Booking.count({
      where: { 
        establishmentId, 
        status: 'completed',
        createdAt: { [Op.gte]: sixMonthsAgo }
      }
    });

    const reviewsInPeriod = await Review.count({
      where: { 
        establishmentId,
        createdAt: { [Op.gte]: sixMonthsAgo }
      }
    });

    const responseRate = completedBookings > 0 
      ? Math.round((reviewsInPeriod / completedBookings) * 100)
      : 0;

    // Recent reviews
    const recentReviews = await Review.findAll({
      where: { establishmentId, isHidden: false },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profileImage']
      }, {
        model: Court,
        as: 'court',
        attributes: ['id', 'name']
      }],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        overview: {
          averageRating: parseFloat(overallStats?.averageRating || 0).toFixed(1),
          totalReviews: parseInt(overallStats?.totalReviews || 0),
          npsScore,
          responseRate
        },
        ratingDistribution: distribution,
        sourceDistribution,
        monthlyTrend,
        recentReviews
      }
    });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({
      error: 'Error fetching review statistics',
      message: error.message
    });
  }
};

// Respond to a review (establishment owner/staff)
const respondToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    const review = await Review.findByPk(id);

    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Review not found'
      });
    }

    // TODO: Verify user has permission to respond (owner/staff of establishment)

    await review.update({
      establishmentResponse: response,
      establishmentResponseAt: new Date()
    });

    res.json({
      success: true,
      message: 'Response added successfully',
      data: review
    });
  } catch (error) {
    console.error('Error responding to review:', error);
    res.status(500).json({
      error: 'Error responding to review',
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
  getUserReviews,
  getBookingByReviewToken,
  createReviewByToken,
  generateBookingReviewToken,
  getEstablishmentReviewStats,
  respondToReview,
  generateReviewToken
};
