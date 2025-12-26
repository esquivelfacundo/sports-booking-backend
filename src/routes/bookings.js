const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const qrService = require('../services/qrcode');
const { Booking, Court, Establishment, BookingPayment } = require('../models');
const { getUserActiveCashRegister, registerSaleMovement } = require('../utils/cashRegisterHelper');
const {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getEstablishmentBookings,
  checkRecurringAvailability
} = require('../controllers/bookingController');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input data',
      details: errors.array()
    });
  }
  next();
};

// Create booking validation
const createBookingValidation = [
  body('courtId')
    .optional()
    .isUUID()
    .withMessage('Valid court ID is required'),
  body('amenityId')
    .optional()
    .isUUID()
    .withMessage('Valid amenity ID is required'),
  body('date')
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid start time in HH:MM format'),
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid end time in HH:MM format'),
  body('duration')
    .isInt({ min: 30, max: 480 })
    .withMessage('Duration must be between 30 and 480 minutes'),
  body('totalAmount')
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  body('paymentType')
    .optional()
    .isIn(['full', 'split'])
    .withMessage('Payment type must be full or split'),
  body('playerCount')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Player count must be between 1 and 20'),
  body('splitPaymentData.totalParticipants')
    .if(body('paymentType').equals('split'))
    .isInt({ min: 2, max: 20 })
    .withMessage('Total participants must be between 2 and 20 for split payments'),
  body('splitPaymentData.participants')
    .if(body('paymentType').equals('split'))
    .isArray()
    .withMessage('Participants must be an array for split payments')
];

// Update booking validation
const updateBookingValidation = [
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
  body('cancellationReason')
    .if(body('status').equals('cancelled'))
    .notEmpty()
    .withMessage('Cancellation reason is required when cancelling')
];

// Query validation
const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled'])
    .withMessage('Invalid status filter'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO format')
];

// ============================================
// Public/Optional Auth Routes (before auth middleware)
// ============================================

// IMPORTANT: Static routes must come BEFORE dynamic :bookingId routes

/**
 * GET /api/bookings/by-payment/:paymentId
 * Find booking by MercadoPago payment ID - PUBLIC
 */
router.get('/by-payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    console.log(`[by-payment] Looking for booking with mpPaymentId: ${paymentId}`);

    // Find booking by mpPaymentId directly
    const booking = await Booking.findOne({
      where: { mpPaymentId: paymentId },
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'slug', 'address', 'city']
          }]
        }
      ]
    });

    if (booking) {
      console.log(`[by-payment] Found booking: ${booking.id}`);
      return res.json(booking);
    }

    // If not found by mpPaymentId, try BookingPayment table
    const payment = await BookingPayment.findOne({
      where: { mpPaymentId: paymentId }
    });

    if (payment && payment.bookingId) {
      console.log(`[by-payment] Found via BookingPayment, bookingId: ${payment.bookingId}`);
      const bookingFromPayment = await Booking.findByPk(payment.bookingId, {
        include: [
          {
            model: Court,
            as: 'court',
            include: [{
              model: Establishment,
              as: 'establishment',
              attributes: ['id', 'name', 'slug', 'address', 'city']
            }]
          }
        ]
      });
      if (bookingFromPayment) {
        return res.json(bookingFromPayment);
      }
    }

    console.log(`[by-payment] No booking found for paymentId: ${paymentId}`);
    return res.status(404).json({ error: 'Reserva no encontrada' });
  } catch (error) {
    console.error('Error finding booking by payment:', error);
    res.status(500).json({ error: 'Error al buscar reserva' });
  }
});

/**
 * GET /api/bookings/by-reference/:reference
 * Find booking by external reference (preference ID or other reference) - PUBLIC
 */
router.get('/by-reference/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const booking = await Booking.findOne({
      where: {
        [Op.or]: [
          { externalReference: reference },
          { mpPreferenceId: reference }
        ]
      },
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'slug', 'address']
          }]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error finding booking by reference:', error);
    res.status(500).json({ error: 'Error al buscar reserva' });
  }
});

/**
 * GET /api/bookings/public/:bookingId
 * Get booking details - PUBLIC (for confirmation page)
 */
router.get('/public/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Court,
          as: 'court',
          include: [{
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'slug', 'address', 'city', 'phone']
          }]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Error al obtener reserva' });
  }
});

/**
 * GET /api/bookings/:bookingId/qr.png
 * Serve QR code as PNG image (for email embedding) - PUBLIC
 */
router.get('/:bookingId/qr.png', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.query;

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).send('Not found');
    }

    // Generate check-in code if not exists
    if (!booking.checkInCode) {
      const checkInCode = qrService.generateCheckInCode();
      await booking.update({ checkInCode });
      booking.checkInCode = checkInCode;
    }

    const qrBuffer = await qrService.generateQRCodeBuffer(bookingId, booking.checkInCode, {
      width: 200,
      darkColor: '#000000',
      lightColor: '#ffffff'
    });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(qrBuffer);
  } catch (error) {
    console.error('Error generating QR image:', error);
    res.status(500).send('Error');
  }
});

/**
 * GET /api/bookings/checkin/:bookingId
 * Get booking details for QR scan - public endpoint
 */
router.get('/checkin/:bookingId', optionalAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.query;

    // Debug log
    console.log('Check-in request:', {
      bookingId,
      code,
      userId: req.user?.id,
      hasAuth: !!req.headers['authorization']
    });

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name', 'sport'] },
        { model: Establishment, as: 'establishment', attributes: ['id', 'name', 'address', 'phone', 'userId'] }
      ]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Verify check-in code if provided
    if (code && booking.checkInCode !== code) {
      return res.status(403).json({ error: 'Código de verificación inválido' });
    }

    // Determine user permissions
    const userId = req.user?.id;
    const isEstablishmentOwner = booking.establishment?.userId === userId;
    const isBookingOwner = booking.userId === userId;
    const canCheckIn = isEstablishmentOwner;

    const response = {
      booking: {
        id: booking.id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        totalAmount: booking.totalAmount,
        depositAmount: booking.depositAmount,
        clientName: booking.clientName,
        clientEmail: canCheckIn ? booking.clientEmail : undefined,
        clientPhone: canCheckIn ? booking.clientPhone : undefined,
        notes: booking.notes,
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt
      },
      court: booking.court ? {
        id: booking.court.id,
        name: booking.court.name,
        sport: booking.court.sport
      } : null,
      establishment: booking.establishment ? {
        id: booking.establishment.id,
        name: booking.establishment.name,
        address: booking.establishment.address,
        phone: booking.establishment.phone
      } : null,
      permissions: {
        canCheckIn,
        isOwner: isBookingOwner,
        isEstablishmentStaff: isEstablishmentOwner
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching booking for check-in:', error);
    res.status(500).json({ error: 'Error al obtener la reserva' });
  }
});

// Protected routes - all booking routes require authentication
router.use(authenticateToken);

// User booking routes
router.get('/', queryValidation, handleValidationErrors, getBookings);
router.post('/', createBookingValidation, handleValidationErrors, createBooking);
router.get('/:id', getBookingById);
router.put('/:id', updateBookingValidation, handleValidationErrors, updateBooking);
router.delete('/:id', cancelBooking);

// Establishment booking routes
router.get('/establishment/:establishmentId', 
  requireRole(['establishment', 'admin']), 
  queryValidation, 
  handleValidationErrors, 
  getEstablishmentBookings
);

/**
 * GET /api/bookings/establishment/:establishmentId/stats
 * Get aggregated statistics for an establishment - optimized endpoint
 * Returns: todayBookings, todayRevenue, monthlyRevenue, totalClients, pendingBookings, confirmedBookings, cancelledBookings
 */
router.get('/establishment/:establishmentId/stats', 
  requireRole(['establishment', 'admin']), 
  async (req, res) => {
    try {
      const { establishmentId } = req.params;
      const { Op, fn, col, literal } = require('sequelize');
      const { Client } = require('../models');
      
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Get first and last day of current month
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

      // Execute all queries in parallel for better performance
      const [
        todayStats,
        monthlyRevenue,
        statusCounts,
        totalClients
      ] = await Promise.all([
        // Today's bookings and revenue
        Booking.findAll({
          where: {
            establishmentId,
            date: today
          },
          attributes: [
            [fn('COUNT', col('id')), 'count'],
            [fn('SUM', literal("CASE WHEN status = 'completed' THEN CAST(\"totalAmount\" AS DECIMAL) ELSE 0 END")), 'revenue']
          ],
          raw: true
        }),
        
        // Monthly revenue (completed bookings only)
        Booking.findAll({
          where: {
            establishmentId,
            date: {
              [Op.between]: [firstDayOfMonth, lastDayOfMonth]
            },
            status: 'completed'
          },
          attributes: [
            [fn('SUM', col('totalAmount')), 'total']
          ],
          raw: true
        }),
        
        // Status counts (all time)
        Booking.findAll({
          where: { establishmentId },
          attributes: [
            'status',
            [fn('COUNT', col('id')), 'count']
          ],
          group: ['status'],
          raw: true
        }),
        
        // Total unique clients
        Client.count({
          where: { establishmentId }
        })
      ]);

      // Process status counts
      const statusMap = {};
      statusCounts.forEach(s => {
        statusMap[s.status] = parseInt(s.count) || 0;
      });

      const stats = {
        todayBookings: parseInt(todayStats[0]?.count) || 0,
        todayRevenue: parseFloat(todayStats[0]?.revenue) || 0,
        monthlyRevenue: parseFloat(monthlyRevenue[0]?.total) || 0,
        totalClients: totalClients || 0,
        occupancyRate: 0, // TODO: Calculate based on available slots
        pendingBookings: statusMap['pending'] || 0,
        confirmedBookings: statusMap['confirmed'] || 0,
        cancelledBookings: statusMap['cancelled'] || 0,
        completedBookings: statusMap['completed'] || 0,
        inProgressBookings: statusMap['in_progress'] || 0,
        noShowBookings: statusMap['no_show'] || 0
      };

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error fetching establishment stats:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/bookings/establishment/:establishmentId/count
 * Get total booking count for an establishment
 */
router.get('/establishment/:establishmentId/count', 
  requireRole(['establishment', 'admin']), 
  async (req, res) => {
    try {
      const { establishmentId } = req.params;
      
      const count = await Booking.count({
        where: { establishmentId }
      });

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Error fetching booking count:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener conteo de reservas'
      });
    }
  }
);

// Check recurring availability (for recurring bookings)
router.post('/check-recurring-availability', checkRecurringAvailability);

/**
 * POST /api/bookings/checkin/:bookingId/complete
 * Mark booking as completed (check-in) - requires auth
 */
router.post('/checkin/:bookingId/complete', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.body;
    const userId = req.user.id;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: Establishment, as: 'establishment', attributes: ['id', 'name', 'userId'] }
      ]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (code && booking.checkInCode !== code) {
      return res.status(403).json({ error: 'Código de verificación inválido' });
    }

    const isEstablishmentOwner = booking.establishment?.userId === userId;
    
    if (!isEstablishmentOwner) {
      return res.status(403).json({ 
        error: 'No tenés permisos para completar esta reserva',
        message: 'Solo el personal del establecimiento puede hacer check-in'
      });
    }

    if (booking.status === 'in_progress') {
      return res.status(400).json({ error: 'Esta reserva ya está en curso' });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Esta reserva ya fue completada' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'No se puede iniciar una reserva cancelada' });
    }

    if (booking.status === 'no_show') {
      return res.status(400).json({ error: 'No se puede iniciar una reserva marcada como no asistió' });
    }

    await booking.update({
      status: 'in_progress',
      startedAt: new Date()
    });

    // Create an Order for this booking (booking_consumption type)
    let order = null;
    try {
      const { Order } = require('../models');
      
      // Check if an order already exists for this booking
      const existingOrder = await Order.findOne({
        where: { bookingId: booking.id }
      });

      if (!existingOrder) {
        // Create a new order linked to this booking
        order = await Order.create({
          establishmentId: booking.establishmentId,
          bookingId: booking.id,
          clientId: booking.clientId || null,
          orderType: 'booking_consumption',
          status: 'pending',
          subtotal: booking.totalAmount || 0,
          discount: 0,
          total: booking.totalAmount || 0,
          paidAmount: booking.depositAmount || 0,
          paymentStatus: (booking.depositAmount >= booking.totalAmount) ? 'paid' : 'pending',
          createdBy: userId,
          notes: `Reserva ${booking.clientName} - ${booking.date}`
        });
      } else {
        order = existingOrder;
      }
    } catch (orderError) {
      console.error('Error creating order for booking:', orderError);
      // Don't fail the whole operation if order creation fails
    }

    res.json({
      success: true,
      message: 'Turno iniciado exitosamente',
      booking: {
        id: booking.id,
        status: 'in_progress',
        startedAt: booking.startedAt
      },
      order: order ? { id: order.id } : null
    });
  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ error: 'Error al completar la reserva' });
  }
});

/**
 * POST /api/bookings/:bookingId/payments
 * Register a partial payment for a booking (cash, transfer, etc.)
 * Used when players pay individually at the establishment
 */
router.post('/:bookingId/payments', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { amount, method = 'cash', playerName, notes } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Verify user has access to this booking's establishment
    const isAdmin = req.user.userType === 'admin';
    const isOwner = booking.establishment.userId === userId;
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.establishmentId;

    if (!isAdmin && !isOwner && !isStaff) {
      return res.status(403).json({ error: 'No tienes permiso para registrar pagos en esta reserva' });
    }

    const currentDeposit = parseFloat(booking.depositAmount) || 0;
    const totalAmount = parseFloat(booking.totalAmount);
    
    // Get consumptions total for this booking
    const BookingConsumption = require('../models').BookingConsumption;
    const consumptions = await BookingConsumption.findAll({
      where: { bookingId },
      attributes: ['totalPrice'],
      raw: true
    });
    const consumptionsTotal = consumptions.reduce((sum, c) => sum + parseFloat(c.totalPrice || 0), 0);
    
    const pendingAmount = totalAmount + consumptionsTotal - currentDeposit;

    if (amount > pendingAmount) {
      return res.status(400).json({ 
        error: 'El monto excede el saldo pendiente',
        pendingAmount 
      });
    }

    // Create payment record
    const payment = await BookingPayment.create({
      bookingId,
      amount: parseFloat(amount),
      method,
      playerName: playerName || null,
      notes: notes || null,
      registeredBy: userId,
      paidAt: new Date()
    });

    const newDepositAmount = currentDeposit + parseFloat(amount);
    const newPendingAmount = totalAmount - newDepositAmount;

    // Update booking with new deposit amount
    const updateData = {
      depositAmount: newDepositAmount
    };

    // If fully paid, update payment status
    if (newPendingAmount <= 0) {
      updateData.paymentStatus = 'completed';
      updateData.paidAt = new Date();
    }

    await booking.update(updateData);

    // Register in cash register if user has one open
    const cashRegister = await getUserActiveCashRegister(userId, booking.establishmentId);
    if (cashRegister) {
      await registerSaleMovement({
        cashRegisterId: cashRegister.id,
        establishmentId: booking.establishmentId,
        bookingId: booking.id,
        amount: parseFloat(amount),
        paymentMethod: method,
        description: `Pago de reserva - ${booking.guestName || 'Cliente'}`,
        registeredBy: userId
      });
    }

    // Get all payments for this booking
    const allPayments = await BookingPayment.findAll({
      where: { bookingId },
      order: [['paidAt', 'ASC']]
    });

    res.json({
      success: true,
      message: `Pago de $${amount.toLocaleString()} registrado exitosamente`,
      payment: {
        id: payment.id,
        amount: parseFloat(payment.amount),
        method: payment.method,
        playerName: payment.playerName,
        paidAt: payment.paidAt
      },
      booking: {
        id: booking.id,
        totalAmount,
        depositAmount: newDepositAmount,
        pendingAmount: newPendingAmount,
        paymentStatus: updateData.paymentStatus || booking.paymentStatus
      },
      payments: allPayments.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        playerName: p.playerName,
        paidAt: p.paidAt
      }))
    });
  } catch (error) {
    console.error('Error registering payment:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Error al registrar el pago', details: error.message });
  }
});

/**
 * GET /api/bookings/:bookingId/payments
 * Get all payments for a booking
 */
router.get('/:bookingId/payments', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const payments = await BookingPayment.findAll({
      where: { bookingId },
      order: [['paidAt', 'ASC']]
    });

    res.json({
      payments: payments.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        playerName: p.playerName,
        paidAt: p.paidAt,
        mpPaymentId: p.mpPaymentId
      }))
    });
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({ error: 'Error al obtener los pagos' });
  }
});

/**
 * GET /api/bookings/:bookingId/qr
 * Generate QR code for a booking
 */
router.get('/:bookingId/qr', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { format = 'dataurl' } = req.query;

    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Generate check-in code if not exists
    if (!booking.checkInCode) {
      const checkInCode = qrService.generateCheckInCode();
      await booking.update({ checkInCode });
      booking.checkInCode = checkInCode;
    }

    if (format === 'svg') {
      const svg = await qrService.generateQRCodeSVG(bookingId, booking.checkInCode);
      res.json({ qr: svg, format: 'svg', url: qrService.getBookingQRUrl(bookingId, booking.checkInCode) });
    } else {
      const dataUrl = await qrService.generateQRCodeDataURL(bookingId, booking.checkInCode);
      res.json({ qr: dataUrl, format: 'dataurl', url: qrService.getBookingQRUrl(bookingId, booking.checkInCode) });
    }
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ error: 'Error al generar código QR' });
  }
});

module.exports = router;
