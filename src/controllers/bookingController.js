const { Booking, Court, Establishment, User, Payment, SplitPayment, SplitPaymentParticipant, Client, Order, Amenity } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');
const WebhookService = require('../services/webhookService');

const createBooking = async (req, res) => {
  try {
    console.log('=== CREATE BOOKING REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const userId = req.user.id;
    const {
      courtId,
      amenityId,
      date,
      startTime,
      endTime,
      duration,
      totalAmount,
      paymentType = 'full',
      playerCount = 1,
      notes,
      splitPaymentData,
      // Guest booking fields (for admin-created bookings)
      clientName,
      clientPhone,
      clientEmail,
      bookingType = 'normal',
      isRecurring = false,
      recurringWeeks = 12, // Default to 12 weeks (3 months) for recurring bookings
      depositAmount = 0,
      depositMethod,
      status: requestedStatus
    } = req.body;
    
    // Validate required fields - either courtId or amenityId must be provided
    if ((!courtId && !amenityId) || !date || !startTime) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'courtId o amenityId, date y startTime son requeridos',
        received: { courtId, amenityId, date, startTime }
      });
    }

    let court = null;
    let amenity = null;
    let establishment = null;

    // Check if booking is for a court or an amenity
    if (courtId) {
      // Verify court exists and is available
      court = await Court.findOne({
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
      establishment = court.establishment;
    } else if (amenityId) {
      // Verify amenity exists and is bookable
      amenity = await Amenity.findOne({
        where: { id: amenityId, isActive: true, isBookable: true },
        include: [{
          model: Establishment,
          as: 'establishment',
          where: { isActive: true }
        }]
      });

      if (!amenity) {
        return res.status(404).json({
          error: 'Amenity not found',
          message: 'The requested amenity is not available'
        });
      }
      establishment = amenity.establishment;
    }

    // Determine if this is an admin/staff creating a booking for a guest
    const isAdmin = req.user.userType === 'admin';
    const isStaff = req.user.isStaff;
    const canManageBookings = isAdmin || isStaff;
    
    // Determine initial status:
    // - Admin/staff can set any status
    // - If deposit is paid, set to confirmed
    // - Otherwise pending
    let initialStatus = 'pending';
    if (requestedStatus && canManageBookings) {
      initialStatus = requestedStatus;
    } else if (depositAmount > 0) {
      // If user paid a deposit online, confirm the booking
      initialStatus = 'confirmed';
    } else if (paymentType === 'split') {
      initialStatus = 'pending';
    }

    // Generate dates for recurring bookings
    const bookingDates = [date];
    if (isRecurring && canManageBookings) {
      const startDate = new Date(date);
      for (let i = 1; i < recurringWeeks; i++) {
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + (7 * i));
        const year = nextDate.getFullYear();
        const month = String(nextDate.getMonth() + 1).padStart(2, '0');
        const day = String(nextDate.getDate()).padStart(2, '0');
        bookingDates.push(`${year}-${month}-${day}`);
      }
    }

    // Check for conflicts on all dates
    for (const bookingDate of bookingDates) {
      // Build conflict query based on whether it's a court or amenity booking
      const conflictWhere = {
        date: bookingDate,
        status: { [Op.in]: ['pending', 'confirmed'] },
        [Op.or]: [
          {
            startTime: { [Op.lt]: endTime },
            endTime: { [Op.gt]: startTime }
          }
        ]
      };
      
      if (courtId) {
        conflictWhere.courtId = courtId;
      } else if (amenityId) {
        conflictWhere.amenityId = amenityId;
      }
      
      console.log('Checking conflicts for:', { courtId, amenityId, bookingDate, startTime, endTime });
      
      const conflictingBooking = await Booking.findOne({ where: conflictWhere });

      if (conflictingBooking) {
        console.log('Found conflicting booking:', conflictingBooking.id, conflictingBooking.startTime, conflictingBooking.endTime);
        return res.status(409).json({
          error: 'Time slot not available',
          message: `El horario ya está reservado para la fecha ${bookingDate}`
        });
      }
      
      // Also check for exact match (unique constraint) - but only for non-cancelled bookings
      const exactMatchWhere = {
        date: bookingDate,
        startTime,
        status: { [Op.ne]: 'cancelled' }
      };
      
      if (courtId) {
        exactMatchWhere.courtId = courtId;
      } else if (amenityId) {
        exactMatchWhere.amenityId = amenityId;
      }
      
      const exactMatch = await Booking.findOne({ where: exactMatchWhere });
      
      if (exactMatch) {
        console.log('Found exact match booking:', exactMatch.id, exactMatch.status);
        const itemName = courtId ? 'cancha' : 'amenity';
        return res.status(409).json({
          error: 'Duplicate booking',
          message: `Ya existe una reserva para este ${itemName}, fecha y horario (${bookingDate} ${startTime})`
        });
      }
      
      // If there's a cancelled booking in the same slot, delete it first
      const cancelledWhere = {
        date: bookingDate,
        startTime,
        status: 'cancelled'
      };
      
      if (courtId) {
        cancelledWhere.courtId = courtId;
      } else if (amenityId) {
        cancelledWhere.amenityId = amenityId;
      }
      
      const cancelledBooking = await Booking.findOne({ where: cancelledWhere });
      
      if (cancelledBooking) {
        console.log('Deleting cancelled booking to make room:', cancelledBooking.id);
        await cancelledBooking.destroy();
      }
    }

    // Create all bookings
    const createdBookings = [];
    
    // For staff-created bookings, don't set userId (it's a guest booking)
    // Staff users are in establishment_staff table, not users table
    const bookingUserId = isStaff ? null : userId;
    const staffId = isStaff ? userId : null; // Track which staff created the booking
    
    for (const bookingDate of bookingDates) {
      const checkInCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      const reviewToken = crypto.randomBytes(32).toString('hex');
      
      const booking = await Booking.create({
        userId: bookingUserId,
        createdByStaffId: staffId,
        establishmentId: establishment.id,
        courtId: courtId || null,
        amenityId: amenityId || null,
        date: bookingDate,
        startTime,
        endTime,
        duration,
        totalAmount,
        paymentType,
        playerCount,
        notes,
        checkInCode,
        status: initialStatus,
        // Guest booking fields
        clientName: clientName || null,
        clientPhone: clientPhone || null,
        clientEmail: clientEmail || null,
        bookingType,
        isRecurring,
        depositAmount,
        initialDeposit: depositAmount,
        depositMethod,
        reviewToken
      });
      
      createdBookings.push(booking);
    }

    // Use the first booking for response
    const booking = createdBookings[0];

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

    // Send webhook notification if booking was created as confirmed (async)
    if (initialStatus === 'confirmed') {
      WebhookService.sendBookingNotification(booking.id)
        .then(result => {
          if (result.success) {
            console.log(`[Webhook] Notification sent for new confirmed booking ${booking.id}`);
          } else if (!result.skipped) {
            console.log(`[Webhook] Failed to send notification for booking ${booking.id}:`, result.error);
          }
        })
        .catch(err => console.error('[Webhook] Error:', err));
    }

    res.status(201).json({
      message: isRecurring 
        ? `Se crearon ${createdBookings.length} turnos fijos exitosamente` 
        : 'Booking created successfully',
      booking: bookingWithDetails,
      totalCreated: createdBookings.length
    });

  } catch (error) {
    console.error('Create booking error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        message: error.errors?.map(e => e.message).join(', ') || 'Datos inválidos',
        details: error.errors?.map(e => ({ field: e.path, message: e.message }))
      });
    }
    
    // Handle unique constraint errors (duplicate booking)
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Duplicate booking',
        message: 'Ya existe una reserva para esta cancha, fecha y horario'
      });
    }
    
    res.status(500).json({
      error: 'Failed to create booking',
      message: error.message || 'An error occurred while creating the booking',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const getBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 100, status, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    console.log(`[getBookings] Fetching bookings for user: ${userId}`);

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

    console.log(`[getBookings] Found ${count} bookings`);
    if (bookings.length > 0) {
      console.log(`[getBookings] First booking courtId: ${bookings[0].courtId}, court: ${bookings[0].court?.name || 'NULL'}`);
    }

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
    const { status, notes, courtId, startTime, endTime, date } = req.body;

    console.log('updateBooking called with:', { id, userId, courtId, startTime, endTime, date, status });

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
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.court.establishmentId;

    if (!isOwner && !isEstablishmentOwner && !isAdmin && !isStaff) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to update this booking'
      });
    }

    const updateData = {};
    
    // Status updates
    if (status) {
      updateData.status = status;
      
      if (status === 'confirmed') {
        updateData.confirmedAt = new Date();
      } else if (status === 'cancelled') {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = req.body.cancellationReason;
      } else if (status === 'completed') {
        updateData.completedAt = new Date();
        // Generate review token for completed bookings
        if (!booking.reviewToken) {
          updateData.reviewToken = crypto.randomBytes(32).toString('hex');
        }
      } else if (status === 'in_progress') {
        updateData.startedAt = new Date();
        
        // Create Order when booking starts (if not already exists)
        const existingOrder = await Order.findOne({
          where: { bookingId: booking.id }
        });
        
        if (!existingOrder) {
          // Generate order number
          const orderCount = await Order.count({
            where: { establishmentId: booking.court.establishmentId }
          });
          const orderNumber = `ORD-${String(orderCount + 1).padStart(6, '0')}`;
          
          await Order.create({
            orderNumber,
            establishmentId: booking.court.establishmentId,
            bookingId: booking.id,
            customerName: booking.clientName || 'Cliente',
            customerPhone: booking.clientPhone,
            orderType: 'booking_consumption',
            status: 'pending',
            subtotal: 0,
            total: 0,
            createdBy: userId,
            notes: `Turno ${booking.court.name} - ${booking.date} ${booking.startTime}`
          });
          console.log(`Order created for booking ${booking.id} on status change to in_progress`);
        }
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Court/time updates (for drag and drop)
    if (courtId) {
      // Verify the new court exists and belongs to the same establishment
      const newCourt = await Court.findOne({
        where: { id: courtId },
        include: [{ model: Establishment, as: 'establishment' }]
      });
      
      if (!newCourt) {
        return res.status(404).json({
          error: 'Court not found',
          message: 'The target court does not exist'
        });
      }
      
      // Verify same establishment
      if (newCourt.establishment.id !== booking.court.establishment.id) {
        return res.status(400).json({
          error: 'Invalid court',
          message: 'Cannot move booking to a court in a different establishment'
        });
      }
      
      updateData.courtId = courtId;
    }

    if (date) {
      updateData.date = date;
    }

    // If changing court or time, check for conflicts
    if (courtId || startTime || date) {
      const checkCourtId = courtId || booking.courtId;
      const checkDate = date || booking.date;
      const checkStartTime = startTime || booking.startTime;
      const checkEndTime = endTime || booking.endTime;
      
      // Normalize time to HH:MM:SS format for database comparison
      const normalizeTime = (t) => {
        if (!t) return '00:00:00';
        const parts = t.split(':');
        const h = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const s = parts[2] ? parts[2].padStart(2, '0') : '00';
        return `${h}:${m}:${s}`;
      };
      
      // Parse times for comparison (in minutes)
      const parseTime = (t) => {
        if (!t) return 0;
        const parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      };
      
      const newStartMinutes = parseTime(checkStartTime);
      const newEndMinutes = parseTime(checkEndTime);
      
      // Check for overlapping bookings - get all potential conflicts
      const potentialConflicts = await Booking.findAll({
        where: {
          id: { [Op.ne]: id }, // Exclude current booking
          courtId: checkCourtId,
          date: checkDate,
          status: { [Op.notIn]: ['cancelled'] }
        }
      });
      
      console.log('Checking conflicts for:', { checkCourtId, checkDate, checkStartTime, checkEndTime, newStartMinutes, newEndMinutes });
      console.log('Found potential conflicts:', potentialConflicts.length);
      
      // Check each booking for time overlap
      for (const conflictingBooking of potentialConflicts) {
        const existingStart = parseTime(conflictingBooking.startTime);
        // Calculate end time from duration if endTime is not set
        const existingEnd = conflictingBooking.endTime 
          ? parseTime(conflictingBooking.endTime)
          : existingStart + (conflictingBooking.duration || 60);
        
        console.log('Comparing with booking:', { 
          id: conflictingBooking.id, 
          existingStart, 
          existingEnd,
          startTime: conflictingBooking.startTime,
          endTime: conflictingBooking.endTime,
          duration: conflictingBooking.duration
        });
        
        // Check for overlap
        if (newStartMinutes < existingEnd && newEndMinutes > existingStart) {
          console.log('CONFLICT DETECTED!');
          return res.status(409).json({
            error: 'Time conflict',
            message: 'The selected time slot is already booked'
          });
        }
      }
      
      // Delete any cancelled bookings in the target slot (to avoid unique constraint violation)
      // Need to check both normalized and original time formats
      const normalizedStartTime = normalizeTime(checkStartTime);
      const cancelledInSlot = await Booking.findAll({
        where: {
          id: { [Op.ne]: id },
          courtId: checkCourtId,
          date: checkDate,
          [Op.or]: [
            { startTime: checkStartTime },
            { startTime: normalizedStartTime },
            { startTime: checkStartTime.substring(0, 5) } // HH:MM format
          ],
          status: 'cancelled'
        }
      });
      
      for (const cancelled of cancelledInSlot) {
        console.log('Deleting cancelled booking to make room:', cancelled.id);
        await cancelled.destroy();
      }
      
      // Normalize times for database update
      if (startTime) {
        updateData.startTime = normalizeTime(startTime);
      }
      if (endTime) {
        updateData.endTime = normalizeTime(endTime);
      }
    } else {
      // Only update if provided and not already handled above
      if (startTime) {
        updateData.startTime = startTime;
      }
      if (endTime) {
        updateData.endTime = endTime;
      }
    }

    await booking.update(updateData);

    // Send webhook notification when booking is confirmed (async, don't wait)
    if (status === 'confirmed') {
      WebhookService.sendBookingNotification(booking.id)
        .then(result => {
          if (result.success) {
            console.log(`[Webhook] Notification sent for booking ${booking.id}`);
          } else if (!result.skipped) {
            console.log(`[Webhook] Failed to send notification for booking ${booking.id}:`, result.error);
          }
        })
        .catch(err => console.error('[Webhook] Error:', err));
    }

    // Reload booking with associations including orders
    const updatedBooking = await Booking.findOne({
      where: { id },
      include: [
        { model: Court, as: 'court' },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
        { model: Order, as: 'orders', attributes: ['id', 'orderNumber'] }
      ]
    });

    res.json({
      message: 'Booking updated successfully',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Update booking error:', error);
    console.error('Error details:', error.message);
    
    // Handle unique constraint violation (duplicate booking)
    if (error.name === 'SequelizeUniqueConstraintError' || 
        (error.original && error.original.code === '23505')) {
      return res.status(409).json({
        error: 'Time conflict',
        message: 'Ya existe una reserva en ese horario para esta cancha'
      });
    }
    
    res.status(500).json({
      error: 'Failed to update booking',
      message: error.message || 'An error occurred while updating the booking'
    });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.userType === 'admin';
    const isStaff = req.user.isStaff;
    const canManageBookings = isAdmin || isStaff;
    const { reason } = req.body;

    // Admins/staff can cancel any booking, regular users can only cancel their own
    let booking;
    if (canManageBookings) {
      booking = await Booking.findOne({
        where: { id },
        include: [{
          model: Court,
          as: 'court',
          attributes: ['establishmentId']
        }]
      });
      // Staff can only cancel bookings from their establishment
      if (isStaff && booking && booking.court.establishmentId !== req.user.establishmentId) {
        booking = null;
      }
    } else {
      booking = await Booking.findOne({
        where: { id, userId }
      });
    }

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
    // Admins/staff can bypass this restriction
    if (!canManageBookings) {
      const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
      const now = new Date();
      const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);

      if (hoursUntilBooking < 2) {
        return res.status(400).json({
          error: 'Cancellation not allowed',
          message: 'Bookings can only be cancelled at least 2 hours in advance'
        });
      }
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
    const { page = 1, limit = 50, status, date, startDate, endDate, futureOnly, clientId, courtId } = req.query;
    const offset = (page - 1) * limit;

    // Verify establishment ownership (admins can access any, staff can access their establishment)
    const isAdmin = req.user.userType === 'admin';
    const isStaff = req.user.isStaff && req.user.establishmentId === establishmentId;
    
    let establishment;
    if (isAdmin || isStaff) {
      establishment = await Establishment.findByPk(establishmentId);
    } else {
      establishment = await Establishment.findOne({
        where: { id: establishmentId, userId }
      });
    }

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

    // Filter by clientId if provided
    if (clientId) {
      where.clientId = clientId;
    }

    // Filter by courtId if provided
    if (courtId) {
      where.courtId = courtId;
    }

    // Date filtering options:
    // 1. Single date filter
    // 2. Date range filter (startDate to endDate)
    // 3. Future only filter (from today onwards)
    // 4. No filter (all bookings)
    if (date) {
      where.date = date;
    } else if (startDate && endDate) {
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.date = { [Op.gte]: startDate };
    } else if (endDate) {
      where.date = { [Op.lte]: endDate };
    } else if (futureOnly === 'true') {
      const today = new Date().toISOString().split('T')[0];
      where.date = { [Op.gte]: today };
    }
    // If no date filter, return all bookings (paginated)

    const { count, rows: bookings } = await Booking.findAndCountAll({
      where,
      attributes: { 
        include: ['establishmentId', 'amenityId', 'reviewToken'] // Ensure these fields are included
      },
      include: [
        {
          model: Court,
          as: 'court',
          attributes: ['id', 'name', 'sport']
        },
        {
          model: Amenity,
          as: 'amenity',
          attributes: ['id', 'name', 'pricePerHour']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'name', 'phone', 'email']
        },
        {
          model: Payment,
          as: 'payments'
        },
        {
          model: Order,
          as: 'orders',
          attributes: ['id', 'orderNumber']
        },
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'slug']
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['date', 'DESC'], ['startTime', 'DESC']]
    });

    // Generate reviewToken for bookings that don't have one
    for (const booking of bookings) {
      if (!booking.reviewToken) {
        const token = crypto.randomBytes(32).toString('hex');
        await booking.update({ reviewToken: token });
        booking.reviewToken = token; // Update the instance too
      }
    }

    // Convert Sequelize instances to plain objects to ensure associations are included
    const bookingsJson = bookings.map(b => b.toJSON());

    // Debug: log amenity bookings
    const amenityBookings = bookingsJson.filter(b => b.amenityId);
    if (amenityBookings.length > 0) {
      console.log('Amenity bookings in response:', amenityBookings.length);
      amenityBookings.forEach(b => {
        console.log(`  - ${b.startTime} | amenityId: ${b.amenityId} | amenity: ${b.amenity?.name || 'N/A'} | client: ${b.clientName}`);
      });
    }

    res.json({
      bookings: bookingsJson,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get establishment bookings error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch bookings',
      message: 'An error occurred while fetching establishment bookings'
    });
  }
};

/**
 * Check availability for multiple dates (for recurring bookings)
 * Returns availability status for each date and suggests alternatives if conflicts exist
 */
const checkRecurringAvailability = async (req, res) => {
  try {
    const {
      courtId,
      dates, // Array of dates in YYYY-MM-DD format
      startTime,
      duration = 60,
      sport // Optional: to find alternative courts of same sport
    } = req.body;

    if (!courtId || !dates || !Array.isArray(dates) || dates.length === 0 || !startTime) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'courtId, dates array, and startTime are required'
      });
    }

    // Get the court and its establishment
    const court = await Court.findOne({
      where: { id: courtId, isActive: true },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['id', 'openingHours']
      }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'The requested court does not exist'
      });
    }

    // Calculate end time
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + parseInt(duration);
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;

    // Get all courts of the same sport for alternatives
    const alternativeCourts = await Court.findAll({
      where: {
        establishmentId: court.establishmentId,
        sport: sport || court.sport,
        isActive: true,
        id: { [Op.ne]: courtId } // Exclude the requested court
      },
      attributes: ['id', 'name', 'sport', 'pricePerHour', 'pricePerHour90', 'pricePerHour120']
    });

    // Check availability for each date
    const results = [];
    
    for (const date of dates) {
      const dateResult = {
        date,
        available: true,
        conflict: null,
        alternatives: []
      };

      // Check if requested court is available
      const existingBooking = await Booking.findOne({
        where: {
          courtId,
          date,
          status: { [Op.in]: ['pending', 'confirmed'] },
          [Op.or]: [
            // New booking starts during existing booking
            {
              startTime: { [Op.lte]: startTime },
              endTime: { [Op.gt]: startTime }
            },
            // New booking ends during existing booking
            {
              startTime: { [Op.lt]: endTime },
              endTime: { [Op.gte]: endTime }
            },
            // New booking completely contains existing booking
            {
              startTime: { [Op.gte]: startTime },
              endTime: { [Op.lte]: endTime }
            }
          ]
        },
        attributes: ['id', 'startTime', 'endTime', 'clientName']
      });

      if (existingBooking) {
        dateResult.available = false;
        dateResult.conflict = {
          courtId,
          courtName: court.name,
          existingBooking: {
            startTime: existingBooking.startTime,
            endTime: existingBooking.endTime,
            clientName: existingBooking.clientName
          }
        };

        // Generate all time slots (every 30 minutes from 8:00 to 22:00)
        const timeSlots = [];
        for (let h = 8; h <= 22; h++) {
          timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
          if (h < 22) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
        }

        // Helper function to check if a slot is available for a court
        const isSlotAvailable = async (checkCourtId, slot, slotEndTime) => {
          const conflict = await Booking.findOne({
            where: {
              courtId: checkCourtId,
              date,
              status: { [Op.in]: ['pending', 'confirmed'] },
              [Op.or]: [
                { startTime: { [Op.lte]: slot }, endTime: { [Op.gt]: slot } },
                { startTime: { [Op.lt]: slotEndTime }, endTime: { [Op.gte]: slotEndTime } },
                { startTime: { [Op.gte]: slot }, endTime: { [Op.lte]: slotEndTime } }
              ]
            }
          });
          return !conflict;
        };

        // Check all courts (including requested and alternatives) for all time slots
        const allCourts = [{ ...court.dataValues, isRequested: true }, ...alternativeCourts.map(c => ({ ...c.dataValues, isRequested: false }))];
        
        for (const slot of timeSlots) {
          const [slotHours, slotMinutes] = slot.split(':').map(Number);
          const slotTotalMinutes = slotHours * 60 + slotMinutes + parseInt(duration);
          const slotEndHours = Math.floor(slotTotalMinutes / 60) % 24;
          const slotEndMinutes = slotTotalMinutes % 60;
          const slotEndTime = `${slotEndHours.toString().padStart(2, '0')}:${slotEndMinutes.toString().padStart(2, '0')}`;

          // Skip if slot would end after closing (23:00)
          if (slotTotalMinutes > 23 * 60) continue;

          for (const checkCourt of allCourts) {
            // Skip the exact same court+time combination that has the conflict
            if (checkCourt.id === courtId && slot === startTime) continue;

            const available = await isSlotAvailable(checkCourt.id, slot, slotEndTime);
            
            if (available) {
              const price = duration === 90 ? (checkCourt.pricePerHour90 || checkCourt.pricePerHour * 1.5) :
                           duration === 120 ? (checkCourt.pricePerHour120 || checkCourt.pricePerHour * 2) :
                           checkCourt.pricePerHour;

              // Determine the type based on court and time
              const isDifferentCourt = checkCourt.id !== courtId;
              const isDifferentTime = slot !== startTime;

              dateResult.alternatives.push({
                type: isDifferentCourt ? 'different_court' : 'different_time',
                courtId: checkCourt.id,
                courtName: checkCourt.name,
                time: slot,
                price: parseFloat(price) || price
              });
            }
          }
        }

        // Sort alternatives: same court first, then by time
        dateResult.alternatives.sort((a, b) => {
          // Prioritize same court (different_time) over different courts
          if (a.type === 'different_time' && b.type === 'different_court') return -1;
          if (a.type === 'different_court' && b.type === 'different_time') return 1;
          // Then sort by time
          return a.time.localeCompare(b.time);
        });
      }

      results.push(dateResult);
    }

    // Summary
    const availableCount = results.filter(r => r.available).length;
    const conflictCount = results.filter(r => !r.available).length;

    res.json({
      success: true,
      court: {
        id: court.id,
        name: court.name,
        sport: court.sport
      },
      requestedTime: startTime,
      duration,
      summary: {
        totalDates: dates.length,
        available: availableCount,
        conflicts: conflictCount
      },
      results
    });

  } catch (error) {
    console.error('Check recurring availability error:', error);
    res.status(500).json({
      error: 'Failed to check availability',
      message: 'An error occurred while checking availability'
    });
  }
};

const exportBookingsToCSV = async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, courtId, status, clientName, paymentMethod } = req.query;
    
    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build query filters
    const where = { establishmentId };

    if (startDate && endDate) {
      where.date = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      where.date = { [Op.gte]: startDate };
    } else if (endDate) {
      where.date = { [Op.lte]: endDate };
    }

    if (courtId) {
      where.courtId = courtId;
    }

    if (status) {
      where.status = status;
    }

    if (clientName) {
      where.clientName = { [Op.iLike]: `%${clientName}%` };
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    // Fetch bookings
    const bookings = await Booking.findAll({
      where,
      include: [
        {
          model: Court,
          as: 'court',
          attributes: ['name']
        },
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Client,
          as: 'client',
          attributes: ['name', 'phone', 'email']
        }
      ],
      order: [['date', 'DESC'], ['startTime', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    
    // Validate data size
    csvUtils.validateDataSize(bookings);

    // Transform data for CSV
    const csvData = bookings.map(booking => {
      const client = booking.client || {};
      const user = booking.user || {};
      const court = booking.court || {};
      
      return {
        fecha: csvUtils.formatDateForCSV(booking.date),
        horaInicio: booking.startTime,
        horaFin: booking.endTime,
        cancha: court.name || 'N/A',
        cliente: booking.clientName || client.name || `${user.firstName} ${user.lastName}`.trim(),
        telefono: booking.clientPhone || client.phone || user.phone || '',
        email: booking.clientEmail || client.email || user.email || '',
        estado: booking.status,
        tipoPago: booking.paymentType === 'full' ? 'Completo' : 'Seña',
        montoTotal: csvUtils.formatCurrencyForCSV(booking.totalAmount),
        seña: csvUtils.formatCurrencyForCSV(booking.depositAmount || booking.initialDeposit),
        saldoPendiente: csvUtils.formatCurrencyForCSV(
          (booking.totalAmount || 0) - (booking.paidAmount || 0)
        ),
        metodoPago: booking.paymentMethod || '',
        notas: booking.notes || ''
      };
    });

    // Define CSV fields
    const fields = [
      { label: 'Fecha', value: 'fecha' },
      { label: 'Hora Inicio', value: 'horaInicio' },
      { label: 'Hora Fin', value: 'horaFin' },
      { label: 'Cancha', value: 'cancha' },
      { label: 'Cliente', value: 'cliente' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Email', value: 'email' },
      { label: 'Estado', value: 'estado' },
      { label: 'Tipo de Pago', value: 'tipoPago' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: 'Seña', value: 'seña' },
      { label: 'Saldo Pendiente', value: 'saldoPendiente' },
      { label: 'Método de Pago', value: 'metodoPago' },
      { label: 'Notas', value: 'notas' }
    ];

    // Generate CSV
    const csv = csvUtils.generateCSV(csvData, fields);
    
    // Generate filename
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `reservas_${establishment.slug || establishmentId}_${dateStr}.csv`;

    // Send response
    csvUtils.sendCSVResponse(res, csv, filename);

  } catch (error) {
    console.error('Error exporting bookings to CSV:', error);
    res.status(500).json({ 
      error: 'Failed to export bookings',
      message: error.message 
    });
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getEstablishmentBookings,
  checkRecurringAvailability,
  exportBookingsToCSV
};

