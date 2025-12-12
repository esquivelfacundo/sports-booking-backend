const { Booking, Court, Establishment, User, Payment, SplitPayment, SplitPaymentParticipant } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

const createBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      courtId,
      date,
      startTime,
      endTime,
      duration,
      totalAmount,
      paymentType = 'full',
      playerCount = 1,
      notes,
      splitPaymentData
    } = req.body;

    // Verify court exists and is available
    const court = await Court.findOne({
      where: { id: courtId, isActive: true },
      include: [{
        model: Establishment,
        as: 'establishment',
        where: { isActive: true }
      }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'The requested court is not available'
      });
    }

    // Check for conflicting bookings
    const conflictingBooking = await Booking.findOne({
      where: {
        courtId,
        date,
        status: { [Op.in]: ['pending', 'confirmed'] },
        [Op.or]: [
          {
            startTime: { [Op.lt]: endTime },
            endTime: { [Op.gt]: startTime }
          }
        ]
      }
    });

    if (conflictingBooking) {
      return res.status(409).json({
        error: 'Time slot not available',
        message: 'This time slot is already booked'
      });
    }

    // Generate check-in code
    const checkInCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    // Create booking
    const booking = await Booking.create({
      userId,
      establishmentId: court.establishmentId,
      courtId,
      date,
      startTime,
      endTime,
      duration,
      totalAmount,
      paymentType,
      playerCount,
      notes,
      checkInCode,
      status: paymentType === 'split' ? 'pending' : 'pending'
    });

    // Handle split payment setup
    if (paymentType === 'split' && splitPaymentData) {
      const { totalParticipants, participants, expiresInHours = 24 } = splitPaymentData;
      const amountPerPerson = totalAmount / totalParticipants;
      const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const splitPayment = await SplitPayment.create({
        bookingId: booking.id,
        organizerId: userId,
        totalAmount,
        amountPerPerson,
        totalParticipants,
        inviteCode,
        expiresAt
      });

      // Create participant records
      if (participants && participants.length > 0) {
        const participantRecords = participants.map(participant => ({
          splitPaymentId: splitPayment.id,
          userId: participant.userId || null,
          email: participant.email,
          name: participant.name,
          phone: participant.phone,
          amount: amountPerPerson
        }));

        await SplitPaymentParticipant.bulkCreate(participantRecords);
      }

      booking.dataValues.splitPayment = splitPayment;
    }

    // Include related data in response
    const bookingWithDetails = await Booking.findByPk(booking.id, {
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city', 'phone']
          }]
        },
        {
          model: SplitPayment,
          as: 'splitPayment',
          include: [{
            model: SplitPaymentParticipant,
            as: 'participants'
          }]
        }
      ]
    });

    res.status(201).json({
      message: 'Booking created successfully',
      booking: bookingWithDetails
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      error: 'Failed to create booking',
      message: 'An error occurred while creating the booking'
    });
  }
};

const getBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId };

    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.date = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      where.date = { [Op.gte]: startDate };
    } else if (endDate) {
      where.date = { [Op.lte]: endDate };
    }

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city', 'phone']
          }]
        },
        {
          model: Payment,
          as: 'payments'
        },
        {
          model: SplitPayment,
          as: 'splitPayment',
          include: [{
            model: SplitPaymentParticipant,
            as: 'participants'
          }]
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['date', 'DESC'], ['startTime', 'DESC']]
    });

    res.json({
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      error: 'Failed to fetch bookings',
      message: 'An error occurred while fetching bookings'
    });
  }
};

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await Booking.findOne({
      where: { id },
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment'
          }]
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Payment,
          as: 'payments'
        },
        {
          model: SplitPayment,
          as: 'splitPayment',
          include: [{
            model: SplitPaymentParticipant,
            as: 'participants',
            include: [{
              model: User,
              as: 'user',
              attributes: ['firstName', 'lastName', 'profileImage']
            }]
          }]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found',
        message: 'The requested booking does not exist'
      });
    }

    // Check if user has access to this booking
    const hasAccess = booking.userId === userId || 
                     booking.court.establishment.userId === userId ||
                     req.user.userType === 'admin';

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to view this booking'
      });
    }

    res.json({ booking });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      error: 'Failed to fetch booking',
      message: 'An error occurred while fetching the booking'
    });
  }
};

const updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { status, notes } = req.body;

    const booking = await Booking.findOne({
      where: { id },
      include: [{
        model: Court,
        as: 'court',
        include: [{
          model: Establishment,
          as: 'establishment'
        }]
      }]
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found',
        message: 'The requested booking does not exist'
      });
    }

    // Check permissions
    const isOwner = booking.userId === userId;
    const isEstablishmentOwner = booking.court.establishment.userId === userId;
    const isAdmin = req.user.userType === 'admin';

    if (!isOwner && !isEstablishmentOwner && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to update this booking'
      });
    }

    const updateData = {};
    
    if (status) {
      updateData.status = status;
      
      if (status === 'confirmed') {
        updateData.confirmedAt = new Date();
      } else if (status === 'cancelled') {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = req.body.cancellationReason;
      } else if (status === 'completed') {
        updateData.completedAt = new Date();
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await booking.update(updateData);

    res.json({
      message: 'Booking updated successfully',
      booking
    });

  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      error: 'Failed to update booking',
      message: 'An error occurred while updating the booking'
    });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const booking = await Booking.findOne({
      where: { id, userId }
    });

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found',
        message: 'Booking not found or you do not have permission to cancel it'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        error: 'Booking already cancelled',
        message: 'This booking has already been cancelled'
      });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel completed booking',
        message: 'Completed bookings cannot be cancelled'
      });
    }

    // Check cancellation policy (e.g., must be at least 2 hours before)
    const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
    const now = new Date();
    const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

    if (hoursUntilBooking < 2) {
      return res.status(400).json({
        error: 'Cancellation not allowed',
        message: 'Bookings can only be cancelled at least 2 hours in advance'
      });
    }

    await booking.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason
    });

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      error: 'Failed to cancel booking',
      message: 'An error occurred while cancelling the booking'
    });
  }
};

const getEstablishmentBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { establishmentId } = req.params;
    const { page = 1, limit = 20, status, date } = req.query;
    const offset = (page - 1) * limit;

    // Verify establishment ownership (admins can access any establishment)
    const isAdmin = req.user.userType === 'admin';
    const establishment = await Establishment.findOne({
      where: isAdmin ? { id: establishmentId } : { id: establishmentId, userId }
    });

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have access to it'
      });
    }

    const where = { establishmentId };

    if (status) {
      where.status = status;
    }

    if (date) {
      where.date = date;
    }

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      include: [
        {
          model: Court,
          as: 'court',
          attributes: ['id', 'name', 'sport']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Payment,
          as: 'payments'
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['date', 'DESC'], ['startTime', 'DESC']]
    });

    res.json({
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get establishment bookings error:', error);
    res.status(500).json({
      error: 'Failed to fetch bookings',
      message: 'An error occurred while fetching establishment bookings'
    });
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getEstablishmentBookings
};

