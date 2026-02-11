const express = require('express');
const router = express.Router();
const { 
  RecurringBookingGroup, 
  Booking, 
  Court, 
  Establishment, 
  Client, 
  User,
  BookingPayment 
} = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');
const { getUserActiveCashRegister, registerSaleMovement } = require('../utils/cashRegisterHelper');
const { sendRecurringBookingWhatsApp } = require('../services/whatsappNotification');

// Helper: Calculate end time from start time and duration
function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;
}

// Helper: Generate recurring dates
function generateRecurringDates(startDate, totalWeeks) {
  const dates = [];
  const baseDate = new Date(startDate + 'T00:00:00');
  
  for (let i = 0; i < totalWeeks; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + (7 * i));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

// GET /api/recurring-bookings - Get all recurring booking groups for an establishment
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, status, clientId } = req.query;
    
    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }
    
    const where = { establishmentId };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    
    const groups = await RecurringBookingGroup.findAll({
      where,
      include: [
        { model: Court, as: 'primaryCourt', attributes: ['id', 'name', 'sport', 'pricePerHour'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'phone', 'email'] },
        { model: User, as: 'createdByUser', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    // Enrich groups with calculated data
    const enrichedGroups = await Promise.all(groups.map(async (group) => {
      const groupData = group.toJSON();
      
      // Count bookings for this group
      const bookings = await Booking.findAll({
        where: { recurringGroupId: group.id },
        attributes: ['id', 'date', 'status']
      });
      
      const today = new Date().toISOString().split('T')[0];
      const totalBookings = bookings.length;
      const completedBookings = bookings.filter(b => 
        b.date < today && b.status !== 'cancelled'
      ).length;
      const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;
      
      return {
        ...groupData,
        // Add frontend-expected fields
        totalWeeks: totalBookings || groupData.totalOccurrences || 0,
        completedOccurrences: completedBookings,
        cancelledOccurrences: cancelledBookings,
        // Ensure pricePerBooking is a number
        pricePerBooking: parseFloat(groupData.pricePerBooking) || 0,
        totalPrice: (parseFloat(groupData.pricePerBooking) || 0) * totalBookings
      };
    }));
    
    res.json({ success: true, groups: enrichedGroups });
  } catch (error) {
    console.error('Error fetching recurring booking groups:', error);
    res.status(500).json({ error: 'Failed to fetch recurring booking groups' });
  }
});

// GET /api/recurring-bookings/:groupId - Get a specific recurring booking group with all bookings
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await RecurringBookingGroup.findByPk(groupId, {
      include: [
        { model: Court, as: 'primaryCourt', attributes: ['id', 'name', 'sport', 'pricePerHour'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'phone', 'email'] },
        { model: User, as: 'createdByUser', attributes: ['id', 'firstName', 'lastName'] },
        { model: Establishment, as: 'establishment', attributes: ['id', 'name', 'recurringPaymentPolicy', 'recurringCancellationPolicy'] }
      ]
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Recurring booking group not found' });
    }
    
    // Get all bookings for this group
    const bookings = await Booking.findAll({
      where: { recurringGroupId: groupId },
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name'] }
      ],
      order: [['date', 'ASC'], ['startTime', 'ASC']]
    });
    
    // Get payments for these bookings
    const bookingIds = bookings.map(b => b.id);
    const payments = await BookingPayment.findAll({
      where: { bookingId: { [Op.in]: bookingIds } },
      order: [['paidAt', 'ASC']]
    });
    
    // Map payments to bookings
    const bookingsWithPayments = bookings.map(b => {
      const bookingPayments = payments.filter(p => p.bookingId === b.id);
      return {
        ...b.toJSON(),
        payments: bookingPayments
      };
    });
    
    res.json({ 
      success: true, 
      group: group.toJSON(),
      bookings: bookingsWithPayments
    });
  } catch (error) {
    console.error('Error fetching recurring booking group:', error);
    res.status(500).json({ error: 'Failed to fetch recurring booking group' });
  }
});

// POST /api/recurring-bookings/check-availability - Check availability for recurring dates
router.post('/check-availability', authenticateToken, async (req, res) => {
  try {
    const {
      establishmentId,
      courtId,
      startDate,
      startTime,
      duration,
      totalWeeks,
      sport
    } = req.body;
    
    if (!establishmentId || !courtId || !startDate || !startTime || !duration || !totalWeeks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Cap totalWeeks at 52 (1 year)
    const cappedWeeks = Math.min(parseInt(totalWeeks) || 52, 52);
    
    const endTime = calculateEndTime(startTime, duration);
    const dates = generateRecurringDates(startDate, cappedWeeks);
    
    // Get the primary court
    const primaryCourt = await Court.findByPk(courtId, {
      attributes: ['id', 'name', 'sport', 'pricePerHour', 'pricePerHour90', 'pricePerHour120']
    });
    
    if (!primaryCourt) {
      return res.status(404).json({ error: 'Court not found' });
    }
    
    // Get alternative courts of the same sport
    const alternativeCourts = await Court.findAll({
      where: {
        establishmentId,
        sport: sport || primaryCourt.sport,
        isActive: true,
        id: { [Op.ne]: courtId }
      },
      attributes: ['id', 'name', 'sport', 'pricePerHour', 'pricePerHour90', 'pricePerHour120']
    });
    
    // Check availability for each date
    const results = [];
    
    for (const date of dates) {
      const dateResult = {
        date,
        dayOfWeek: new Date(date + 'T00:00:00').getDay(),
        primaryCourt: {
          id: primaryCourt.id,
          name: primaryCourt.name,
          available: true
        },
        selectedCourt: {
          id: primaryCourt.id,
          name: primaryCourt.name
        },
        alternatives: [],
        isSkipped: false
      };
      
      // Check if primary court is available
      const primaryConflict = await Booking.findOne({
        where: {
          courtId,
          date,
          status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
          [Op.or]: [
            { startTime: { [Op.lt]: endTime }, endTime: { [Op.gt]: startTime } }
          ]
        }
      });
      
      if (primaryConflict) {
        dateResult.primaryCourt.available = false;
        dateResult.primaryCourt.conflictWith = primaryConflict.clientName || 'Reserva existente';
        
        // Check alternatives
        for (const altCourt of alternativeCourts) {
          const altConflict = await Booking.findOne({
            where: {
              courtId: altCourt.id,
              date,
              status: { [Op.in]: ['pending', 'confirmed', 'in_progress'] },
              [Op.or]: [
                { startTime: { [Op.lt]: endTime }, endTime: { [Op.gt]: startTime } }
              ]
            }
          });
          
          dateResult.alternatives.push({
            id: altCourt.id,
            name: altCourt.name,
            available: !altConflict
          });
        }
        
        // Auto-select first available alternative
        const firstAvailable = dateResult.alternatives.find(a => a.available);
        if (firstAvailable) {
          dateResult.selectedCourt = { id: firstAvailable.id, name: firstAvailable.name };
        } else {
          // No alternatives available, this date will be skipped unless user forces it
          dateResult.selectedCourt = null;
        }
      }
      
      results.push(dateResult);
    }
    
    res.json({
      success: true,
      primaryCourt,
      alternativeCourts,
      availability: results,
      summary: {
        total: results.length,
        available: results.filter(r => r.primaryCourt.available).length,
        needsAlternative: results.filter(r => !r.primaryCourt.available && r.selectedCourt).length,
        unavailable: results.filter(r => !r.primaryCourt.available && !r.selectedCourt).length
      }
    });
  } catch (error) {
    console.error('Error checking recurring availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// POST /api/recurring-bookings - Create a new recurring booking group
router.post('/', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      establishmentId,
      courtId,
      clientId,
      clientName,
      clientPhone,
      clientEmail,
      startDate,
      startTime,
      duration,
      sport,
      bookingType = 'normal',
      totalWeeks,
      pricePerBooking,
      notes,
      // Array of date configurations: [{ date, courtId, skip }]
      dateConfigurations = [],
      // Initial payment
      initialPayment = {
        amount: 0,
        method: 'cash'
      }
    } = req.body;
    
    // Validate required fields
    if (!establishmentId || !courtId || !startDate || !startTime || !duration || !totalWeeks || !pricePerBooking) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Cap totalWeeks at 52 (1 year)
    const cappedTotalWeeks = Math.min(parseInt(totalWeeks) || 52, 52);
    
    // Get establishment to check payment policy
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Establishment not found' });
    }
    
    // Get court info
    const court = await Court.findByPk(courtId);
    if (!court) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Court not found' });
    }
    
    const endTime = calculateEndTime(startTime, duration);
    const dates = generateRecurringDates(startDate, cappedTotalWeeks);
    const dayOfWeek = new Date(startDate + 'T00:00:00').getDay();
    
    // Create date config map for easy lookup
    const dateConfigMap = {};
    for (const config of dateConfigurations) {
      dateConfigMap[config.date] = config;
    }
    
    // Filter out skipped dates and prepare booking data
    const bookingsToCreate = [];
    let sequence = 1;
    
    for (const date of dates) {
      const config = dateConfigMap[date] || {};
      
      // Skip if explicitly marked as skipped
      if (config.skip) continue;
      
      // Use configured court or default to primary court
      const bookingCourtId = config.courtId || courtId;
      
      bookingsToCreate.push({
        date,
        courtId: bookingCourtId,
        sequence
      });
      
      sequence++;
    }
    
    if (bookingsToCreate.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No valid dates for booking' });
    }
    
    // Calculate end date
    const lastBooking = bookingsToCreate[bookingsToCreate.length - 1];
    const endDate = lastBooking.date;
    
    // Create the recurring booking group
    // All users (including staff) are now in unified users table
    const createdByUserId = req.user.id;
    
    const group = await RecurringBookingGroup.create({
      establishmentId,
      clientId: clientId || null,
      clientName,
      clientPhone,
      clientEmail,
      courtId,
      dayOfWeek,
      startTime: startTime + ':00',
      endTime,
      duration,
      sport: sport || court.sport,
      bookingType,
      totalOccurrences: bookingsToCreate.length,
      pricePerBooking,
      startDate,
      endDate,
      notes,
      createdBy: createdByUserId,
      // If advance_one policy, first booking is paid
      paidBookingsCount: establishment.recurringPaymentPolicy === 'advance_one' && initialPayment.amount >= pricePerBooking ? 1 : 0,
      totalPaid: initialPayment.amount || 0
    }, { transaction });
    
    // Create individual bookings
    const createdBookings = [];
    
    for (const bookingData of bookingsToCreate) {
      const checkInCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      
      // Determine payment status for this booking
      let recurringPaymentStatus = 'pending';
      if (bookingData.sequence === 1 && initialPayment.amount >= pricePerBooking) {
        recurringPaymentStatus = 'paid';
      }
      
      const booking = await Booking.create({
        establishmentId,
        courtId: bookingData.courtId,
        clientId: clientId || null,
        clientName,
        clientPhone,
        clientEmail,
        date: bookingData.date,
        startTime: startTime + ':00',
        endTime,
        duration,
        totalAmount: pricePerBooking,
        status: 'confirmed',
        paymentStatus: recurringPaymentStatus === 'paid' ? 'completed' : 'pending',
        bookingType,
        isRecurring: true,
        recurringGroupId: group.id,
        recurringSequence: bookingData.sequence,
        recurringPaymentStatus,
        checkInCode,
        depositAmount: recurringPaymentStatus === 'paid' ? pricePerBooking : 0,
        initialDeposit: recurringPaymentStatus === 'paid' ? pricePerBooking : 0,
        depositMethod: recurringPaymentStatus === 'paid' ? initialPayment.method : null,
        notes
      }, { transaction });
      
      createdBookings.push(booking);
      
      // Create payment record for first booking if paid
      if (bookingData.sequence === 1 && initialPayment.amount > 0) {
        await BookingPayment.create({
          bookingId: booking.id,
          amount: initialPayment.amount,
          method: initialPayment.method,
          playerName: clientName || 'Turno Fijo',
          paymentType: 'deposit',
          paidAt: new Date(),
          registeredBy: createdByUserId // All users now in unified table
        }, { transaction });
      }
    }
    
    // Register in cash register if open
    if (initialPayment.amount > 0) {
      try {
        const cashRegister = await getUserActiveCashRegister(req.user.id, establishmentId);
        if (cashRegister) {
          await registerSaleMovement({
            cashRegisterId: cashRegister.id,
            establishmentId,
            bookingId: createdBookings[0].id,
            amount: initialPayment.amount,
            paymentMethod: initialPayment.method,
            description: `Turno fijo - ${clientName || 'Cliente'} (1/${bookingsToCreate.length})`,
            registeredBy: req.user.id
          }, transaction);
        }
      } catch (cashError) {
        console.error('Error registering in cash register:', cashError);
        // Don't fail the transaction for cash register errors
      }
    }
    
    await transaction.commit();

    // Send WhatsApp notification for recurring booking (one message only)
    if (clientPhone) {
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const dayName = dayNames[dayOfWeek];
      const fmtTime = startTime.slice(0, 5);

      sendRecurringBookingWhatsApp({
        clientPhone,
        clientName: clientName || 'Cliente',
        establishmentName: establishment?.name || 'Establecimiento',
        courtName: court?.name || 'Sin cancha',
        dayAndTime: `${dayName} a las ${fmtTime}`,
      }).catch(err => console.error('[WhatsApp Notification] Recurring error:', err.message));
    }

    res.status(201).json({
      success: true,
      message: `Turno fijo creado con ${createdBookings.length} reservas`,
      group: {
        id: group.id,
        totalOccurrences: group.totalOccurrences,
        startDate: group.startDate,
        endDate: group.endDate,
        pricePerBooking: group.pricePerBooking
      },
      bookings: createdBookings.map(b => ({
        id: b.id,
        date: b.date,
        courtId: b.courtId,
        sequence: b.recurringSequence,
        paymentStatus: b.recurringPaymentStatus
      }))
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating recurring booking:', error);
    res.status(500).json({ error: 'Failed to create recurring booking', details: error.message });
  }
});

// POST /api/recurring-bookings/:groupId/pay - Register payment for next booking
router.post('/:groupId/pay', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { groupId } = req.params;
    const { amount, method, bookingId } = req.body;
    
    const group = await RecurringBookingGroup.findByPk(groupId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });
    
    if (!group) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Recurring booking group not found' });
    }
    
    // Find the booking to pay
    let bookingToPay;
    if (bookingId) {
      bookingToPay = await Booking.findOne({
        where: { id: bookingId, recurringGroupId: groupId }
      });
    } else {
      // Find next unpaid booking
      bookingToPay = await Booking.findOne({
        where: {
          recurringGroupId: groupId,
          recurringPaymentStatus: 'pending',
          status: { [Op.in]: ['pending', 'confirmed'] }
        },
        order: [['date', 'ASC']]
      });
    }
    
    if (!bookingToPay) {
      await transaction.rollback();
      return res.status(404).json({ error: 'No pending booking found to pay' });
    }
    
    const paymentAmount = amount || parseFloat(group.pricePerBooking);
    
    // Update booking payment status
    await bookingToPay.update({
      recurringPaymentStatus: 'paid',
      paymentStatus: 'completed',
      depositAmount: paymentAmount,
      depositMethod: method,
      paidAt: new Date()
    }, { transaction });
    
    // Create payment record
    // Only set registeredBy if user is not staff (staff IDs are in establishment_staff table, not users)
    const registeredByUserId = req.user.isStaff ? null : req.user.id;
    
    await BookingPayment.create({
      bookingId: bookingToPay.id,
      amount: paymentAmount,
      method,
      playerName: group.clientName || 'Turno Fijo',
      paymentType: 'declared',
      paidAt: new Date(),
      registeredBy: registeredByUserId
    }, { transaction });
    
    // Update group totals
    await group.update({
      totalPaid: parseFloat(group.totalPaid) + paymentAmount,
      paidBookingsCount: group.paidBookingsCount + 1
    }, { transaction });
    
    // Register in cash register
    try {
      const cashRegister = await getUserActiveCashRegister(req.user.id, group.establishmentId);
      if (cashRegister) {
        await registerSaleMovement({
          cashRegisterId: cashRegister.id,
          establishmentId: group.establishmentId,
          bookingId: bookingToPay.id,
          amount: paymentAmount,
          paymentMethod: method,
          description: `Turno fijo - ${group.clientName || 'Cliente'} (${bookingToPay.recurringSequence}/${group.totalOccurrences})`,
          registeredBy: req.user.id
        }, transaction);
      }
    } catch (cashError) {
      console.error('Error registering in cash register:', cashError);
    }
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: 'Pago registrado exitosamente',
      booking: {
        id: bookingToPay.id,
        date: bookingToPay.date,
        sequence: bookingToPay.recurringSequence,
        paymentStatus: 'paid'
      },
      group: {
        totalPaid: parseFloat(group.totalPaid) + paymentAmount,
        paidBookingsCount: group.paidBookingsCount + 1
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error registering payment:', error);
    res.status(500).json({ error: 'Failed to register payment' });
  }
});

// DELETE /api/recurring-bookings/:groupId - Cancel recurring bookings
router.delete('/:groupId', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { groupId } = req.params;
    const { cancelType = 'all', bookingId, fromDate, reason } = req.body;
    // cancelType: 'single' | 'from_date' | 'all_pending'
    
    const group = await RecurringBookingGroup.findByPk(groupId);
    
    if (!group) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Recurring booking group not found' });
    }
    
    let cancelledBookings = [];
    
    if (cancelType === 'single' && bookingId) {
      // Cancel single booking
      const booking = await Booking.findOne({
        where: { id: bookingId, recurringGroupId: groupId }
      });
      
      if (!booking) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      await booking.update({
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date()
      }, { transaction });
      
      cancelledBookings.push(booking);
      
      // Update group
      await group.update({
        cancelledOccurrences: group.cancelledOccurrences + 1
      }, { transaction });
      
    } else if (cancelType === 'from_date' && (fromDate || bookingId)) {
      // Cancel from a specific date forward
      let startDate = fromDate;
      
      // If bookingId provided, get the date from that booking
      if (bookingId && !fromDate) {
        const refBooking = await Booking.findByPk(bookingId);
        if (refBooking) {
          startDate = refBooking.date;
        }
      }
      
      if (!startDate) {
        startDate = new Date().toISOString().split('T')[0];
      }
      
      const bookingsFromDate = await Booking.findAll({
        where: {
          recurringGroupId: groupId,
          status: { [Op.in]: ['pending', 'confirmed'] },
          date: { [Op.gte]: startDate }
        }
      });
      
      for (const booking of bookingsFromDate) {
        await booking.update({
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date()
        }, { transaction });
        cancelledBookings.push(booking);
      }
      
      // Update group - if all future cancelled, mark as cancelled
      const remainingActive = await Booking.count({
        where: {
          recurringGroupId: groupId,
          status: { [Op.in]: ['pending', 'confirmed'] },
          date: { [Op.gte]: new Date().toISOString().split('T')[0] }
        },
        transaction
      });
      
      if (remainingActive === 0) {
        await group.update({
          status: 'cancelled',
          cancelledOccurrences: group.cancelledOccurrences + bookingsFromDate.length
        }, { transaction });
      } else {
        await group.update({
          cancelledOccurrences: group.cancelledOccurrences + bookingsFromDate.length
        }, { transaction });
      }
      
    } else {
      // Cancel all pending bookings
      const pendingBookings = await Booking.findAll({
        where: {
          recurringGroupId: groupId,
          status: { [Op.in]: ['pending', 'confirmed'] },
          date: { [Op.gte]: new Date().toISOString().split('T')[0] }
        }
      });
      
      for (const booking of pendingBookings) {
        await booking.update({
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date()
        }, { transaction });
        cancelledBookings.push(booking);
      }
      
      // Update group status
      await group.update({
        status: 'cancelled',
        cancelledOccurrences: group.cancelledOccurrences + pendingBookings.length
      }, { transaction });
    }
    
    await transaction.commit();
    
    // Calculate refund info based on policy
    const establishment = await Establishment.findByPk(group.establishmentId);
    const refundPolicy = establishment?.recurringCancellationPolicy || 'credit';
    
    // Count paid but unused bookings
    const paidUnusedCount = cancelledBookings.filter(b => 
      b.recurringPaymentStatus === 'paid' || b.recurringPaymentStatus === 'paid_in_advance'
    ).length;
    
    const refundAmount = paidUnusedCount * parseFloat(group.pricePerBooking);
    
    res.json({
      success: true,
      message: cancelType === 'single' 
        ? 'Turno cancelado exitosamente' 
        : `${cancelledBookings.length} turnos cancelados exitosamente`,
      cancelledBookings: cancelledBookings.map(b => ({
        id: b.id,
        date: b.date,
        sequence: b.recurringSequence
      })),
      refund: {
        policy: refundPolicy,
        paidUnusedCount,
        amount: refundAmount,
        action: refundPolicy === 'credit' 
          ? 'Se acreditará a favor del cliente' 
          : refundPolicy === 'refund_unused' 
            ? 'Se debe reembolsar al cliente' 
            : 'Sin reembolso según política'
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error cancelling recurring booking:', error);
    res.status(500).json({ error: 'Failed to cancel recurring booking' });
  }
});

// GET /api/recurring-bookings/:groupId/pending-bookings - Get pending bookings for cancellation preview
router.get('/:groupId/pending-bookings', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await RecurringBookingGroup.findByPk(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Recurring booking group not found' });
    }
    
    const pendingBookings = await Booking.findAll({
      where: {
        recurringGroupId: groupId,
        status: { [Op.in]: ['pending', 'confirmed'] },
        date: { [Op.gte]: new Date().toISOString().split('T')[0] }
      },
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name'] }
      ],
      order: [['date', 'ASC']]
    });
    
    res.json({
      success: true,
      pendingBookings: pendingBookings.map(b => ({
        id: b.id,
        date: b.date,
        court: b.court?.name,
        sequence: b.recurringSequence,
        paymentStatus: b.recurringPaymentStatus
      })),
      summary: {
        total: pendingBookings.length,
        paid: pendingBookings.filter(b => b.recurringPaymentStatus === 'paid').length,
        unpaid: pendingBookings.filter(b => b.recurringPaymentStatus === 'pending').length
      }
    });
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    res.status(500).json({ error: 'Failed to fetch pending bookings' });
  }
});

// Export recurring bookings to CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, status, clientId, startDate, endDate } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (startDate) where.startDate = { [Op.gte]: startDate };
    if (endDate) where.endDate = { ...where.endDate, [Op.lte]: endDate };

    const groups = await RecurringBookingGroup.findAll({
      where,
      include: [
        { model: Court, as: 'primaryCourt', attributes: ['id', 'name', 'sport'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'phone', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const csvDataPromises = groups.map(async (group) => {
      const bookings = await Booking.findAll({
        where: { recurringGroupId: group.id },
        attributes: ['id', 'status']
      });

      const totalBookings = bookings.length;
      const completedBookings = bookings.filter(b => b.status === 'completed').length;

      return {
        grupo: group.groupName || `Grupo #${group.id.slice(0, 8)}`,
        frecuencia: group.frequency === 'weekly' ? 'Semanal' : group.frequency,
        diaSemana: dayNames[group.dayOfWeek] || group.dayOfWeek,
        hora: group.startTime?.slice(0, 5) || '-',
        cancha: group.primaryCourt?.name || '-',
        cliente: group.client?.name || group.clientName || '-',
        telefono: group.client?.phone || group.clientPhone || '-',
        fechaInicio: csvUtils.formatDateForCSV(group.startDate),
        fechaFin: group.endDate ? csvUtils.formatDateForCSV(group.endDate) : 'Indefinido',
        totalReservas: totalBookings,
        reservasCompletadas: completedBookings,
        estado: group.status === 'active' ? 'Activo' : group.status === 'paused' ? 'Pausado' : 'Finalizado'
      };
    });

    const csvData = await Promise.all(csvDataPromises);

    const fields = [
      { label: 'Grupo', value: 'grupo' },
      { label: 'Frecuencia', value: 'frecuencia' },
      { label: 'Día de Semana', value: 'diaSemana' },
      { label: 'Hora', value: 'hora' },
      { label: 'Cancha', value: 'cancha' },
      { label: 'Cliente', value: 'cliente' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Fecha Inicio', value: 'fechaInicio' },
      { label: 'Fecha Fin', value: 'fechaFin' },
      { label: 'Total Reservas', value: 'totalReservas' },
      { label: 'Reservas Completadas', value: 'reservasCompletadas' },
      { label: 'Estado', value: 'estado' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `reservas_recurrentes_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting recurring bookings:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
