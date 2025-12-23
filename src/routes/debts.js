const express = require('express');
const router = express.Router();
const { ClientDebt, Establishment, Booking, Client } = require('../models');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { Op } = require('sequelize');

/**
 * GET /api/debts/check
 * Check if a client has pending debts at an establishment
 * Query: { establishmentId, email }
 * Public endpoint - used during checkout
 */
router.get('/check', async (req, res) => {
  try {
    const { establishmentId, email } = req.query;

    if (!establishmentId || !email) {
      return res.status(400).json({ error: 'establishmentId and email are required' });
    }

    // Find pending debts for this email at this establishment
    const debts = await ClientDebt.findAll({
      where: {
        establishmentId,
        clientEmail: email.toLowerCase(),
        status: 'pending'
      },
      include: [
        { model: Booking, as: 'originBooking', attributes: ['id', 'date', 'startTime'] }
      ],
      order: [['createdAt', 'ASC']]
    });

    const totalDebt = debts.reduce((sum, debt) => sum + parseFloat(debt.amount), 0);

    res.json({
      success: true,
      hasDebt: debts.length > 0,
      totalDebt,
      debts: debts.map(d => ({
        id: d.id,
        amount: parseFloat(d.amount),
        reason: d.reason,
        description: d.description,
        createdAt: d.createdAt,
        originBooking: d.originBooking ? {
          id: d.originBooking.id,
          date: d.originBooking.date,
          startTime: d.originBooking.startTime
        } : null
      }))
    });

  } catch (err) {
    console.error('Error checking debts:', err);
    res.status(500).json({ error: 'Error checking debts' });
  }
});

/**
 * GET /api/debts/establishment/:establishmentId
 * Get all debts for an establishment (admin view)
 * Requires authentication as establishment owner
 */
router.get('/establishment/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { status } = req.query;

    // Verify user owns this establishment
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment || establishment.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const where = { establishmentId };
    if (status) {
      where.status = status;
    }

    const debts = await ClientDebt.findAll({
      where,
      include: [
        { model: Booking, as: 'originBooking', attributes: ['id', 'date', 'startTime', 'clientName'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'email', 'phone'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const summary = {
      total: debts.length,
      pending: debts.filter(d => d.status === 'pending').length,
      paid: debts.filter(d => d.status === 'paid').length,
      forgiven: debts.filter(d => d.status === 'forgiven').length,
      totalPendingAmount: debts
        .filter(d => d.status === 'pending')
        .reduce((sum, d) => sum + parseFloat(d.amount), 0)
    };

    res.json({
      success: true,
      summary,
      debts: debts.map(d => ({
        id: d.id,
        clientEmail: d.clientEmail,
        clientName: d.client?.name || d.originBooking?.clientName || 'Desconocido',
        amount: parseFloat(d.amount),
        reason: d.reason,
        description: d.description,
        status: d.status,
        createdAt: d.createdAt,
        paidAt: d.paidAt,
        originBooking: d.originBooking ? {
          id: d.originBooking.id,
          date: d.originBooking.date,
          startTime: d.originBooking.startTime
        } : null
      }))
    });

  } catch (err) {
    console.error('Error getting establishment debts:', err);
    res.status(500).json({ error: 'Error getting debts' });
  }
});

/**
 * POST /api/debts/forgive/:debtId
 * Forgive a debt (establishment admin only)
 */
router.post('/forgive/:debtId', authenticateToken, async (req, res) => {
  try {
    const { debtId } = req.params;
    const { reason } = req.body;

    const debt = await ClientDebt.findByPk(debtId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    // Verify user owns this establishment
    if (debt.establishment.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (debt.status !== 'pending') {
      return res.status(400).json({ error: 'Debt is not pending' });
    }

    await debt.update({
      status: 'forgiven',
      forgivenBy: req.user.id,
      forgivenAt: new Date(),
      forgivenReason: reason || 'Perdonada por el establecimiento'
    });

    res.json({
      success: true,
      message: 'Debt forgiven successfully'
    });

  } catch (err) {
    console.error('Error forgiving debt:', err);
    res.status(500).json({ error: 'Error forgiving debt' });
  }
});

/**
 * Create a debt for late cancellation
 * Called internally when a booking is cancelled late
 */
async function createLateCancellationDebt(booking, establishment) {
  try {
    const debt = await ClientDebt.create({
      clientId: booking.clientId || null,
      userId: booking.userId || null,
      clientEmail: booking.clientEmail?.toLowerCase() || '',
      establishmentId: booking.establishmentId,
      bookingId: booking.id,
      amount: booking.totalAmount - (booking.depositAmount || 0), // Remaining amount they would have paid
      reason: 'late_cancellation',
      description: `Cancelación tardía de reserva del ${booking.date} a las ${booking.startTime}`
    });

    console.log(`[Debt] Created late cancellation debt: ${debt.id} for $${debt.amount}`);
    return debt;
  } catch (err) {
    console.error('[Debt] Error creating late cancellation debt:', err);
    return null;
  }
}

/**
 * Create a debt for no-show
 * Called when a booking is marked as no_show
 */
async function createNoShowDebt(booking, establishment) {
  try {
    const debt = await ClientDebt.create({
      clientId: booking.clientId || null,
      userId: booking.userId || null,
      clientEmail: booking.clientEmail?.toLowerCase() || '',
      establishmentId: booking.establishmentId,
      bookingId: booking.id,
      amount: booking.totalAmount - (booking.depositAmount || 0), // Remaining amount
      reason: 'no_show',
      description: `No asistió a la reserva del ${booking.date} a las ${booking.startTime}`
    });

    console.log(`[Debt] Created no-show debt: ${debt.id} for $${debt.amount}`);
    return debt;
  } catch (err) {
    console.error('[Debt] Error creating no-show debt:', err);
    return null;
  }
}

/**
 * Mark debts as paid when included in a booking payment
 */
async function markDebtsAsPaid(debtIds, paidBookingId) {
  try {
    await ClientDebt.update(
      {
        status: 'paid',
        paidAt: new Date(),
        paidBookingId
      },
      {
        where: {
          id: { [Op.in]: debtIds },
          status: 'pending'
        }
      }
    );

    console.log(`[Debt] Marked ${debtIds.length} debts as paid in booking ${paidBookingId}`);
    return true;
  } catch (err) {
    console.error('[Debt] Error marking debts as paid:', err);
    return false;
  }
}

module.exports = router;
module.exports.createLateCancellationDebt = createLateCancellationDebt;
module.exports.createNoShowDebt = createNoShowDebt;
module.exports.markDebtsAsPaid = markDebtsAsPaid;
