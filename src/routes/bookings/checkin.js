const express = require('express');
const router = express.Router();
const { Booking, Court, Establishment, User } = require('../../models');
const { authenticateToken, optionalAuth } = require('../../middleware/auth');
const qrService = require('../../services/qrcode');

/**
 * GET /api/bookings/checkin/:bookingId
 * Get booking details for QR scan
 * - If user is staff of the establishment: can complete the booking
 * - If user is the booking owner or not logged in: just show details
 */
router.get('/:bookingId', optionalAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.query;

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
    
    // Check if user is staff of this establishment (you can expand this logic)
    const canCheckIn = isEstablishmentOwner; // For now, only owner can check-in

    // Build response
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

/**
 * POST /api/bookings/checkin/:bookingId/complete
 * Mark booking as completed (check-in)
 * Only establishment owner/staff can do this
 */
router.post('/:bookingId/complete', authenticateToken, async (req, res) => {
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

    // Verify check-in code
    if (code && booking.checkInCode !== code) {
      return res.status(403).json({ error: 'Código de verificación inválido' });
    }

    // Check if user has permission to complete this booking
    const isEstablishmentOwner = booking.establishment?.userId === userId;
    
    if (!isEstablishmentOwner) {
      return res.status(403).json({ 
        error: 'No tenés permisos para completar esta reserva',
        message: 'Solo el personal del establecimiento puede hacer check-in'
      });
    }

    // Check booking status
    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Esta reserva ya fue completada' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'No se puede completar una reserva cancelada' });
    }

    // Complete the booking
    await booking.update({
      status: 'completed',
      completedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Reserva completada exitosamente',
      booking: {
        id: booking.id,
        status: 'completed',
        completedAt: booking.completedAt
      }
    });

  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ error: 'Error al completar la reserva' });
  }
});

/**
 * GET /api/bookings/:bookingId/qr
 * Generate QR code for a booking
 */
router.get('/:bookingId/qr', optionalAuth, async (req, res) => {
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
