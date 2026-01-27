const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getFinancialSummary,
  getPendingPayments,
  getSalesByProductAndPaymentMethod
} = require('../controllers/financeController');
const { Booking, Establishment, Court } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get financial summary for an establishment
router.get('/establishment/:establishmentId', getFinancialSummary);

// Get pending payments
router.get('/establishment/:establishmentId/pending', getPendingPayments);

// Get sales by product and payment method
router.get('/establishment/:establishmentId/sales-by-product', getSalesByProductAndPaymentMethod);

// Export financial summary to CSV
router.get('/summary/export', async (req, res) => {
  try {
    const { establishmentId, period = 'day', startDate, endDate } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };
    
    let dateFrom = startDate ? new Date(startDate) : new Date();
    let dateTo = endDate ? new Date(endDate) : new Date();
    
    if (!startDate) {
      dateFrom.setMonth(dateFrom.getMonth() - 1);
    }

    where.date = { [Op.between]: [dateFrom.toISOString().split('T')[0], dateTo.toISOString().split('T')[0]] };

    const bookings = await Booking.findAll({
      where,
      attributes: ['date', 'totalAmount', 'depositAmount', 'paidAmount', 'status'],
      order: [['date', 'ASC']]
    });

    const csvUtils = require('../utils/csvGenerator');

    // Group by period
    const grouped = {};
    bookings.forEach(b => {
      let key;
      const date = new Date(b.date);
      if (period === 'day') {
        key = b.date;
      } else if (period === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else if (period === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = b.date;
      }

      if (!grouped[key]) {
        grouped[key] = { totalAmount: 0, deposits: 0, paid: 0, count: 0 };
      }
      grouped[key].totalAmount += parseFloat(b.totalAmount || 0);
      grouped[key].deposits += parseFloat(b.depositAmount || 0);
      grouped[key].paid += parseFloat(b.paidAmount || 0);
      grouped[key].count += 1;
    });

    const csvData = Object.entries(grouped).map(([date, data]) => ({
      fecha: date,
      ingresosTotales: csvUtils.formatNumberForCSV(data.totalAmount),
      depositos: csvUtils.formatNumberForCSV(data.deposits),
      pagado: csvUtils.formatNumberForCSV(data.paid),
      saldoPendiente: csvUtils.formatNumberForCSV(data.totalAmount - data.paid),
      cantidadReservas: data.count,
      ticketPromedio: csvUtils.formatNumberForCSV(data.count > 0 ? data.totalAmount / data.count : 0)
    }));

    const fields = [
      { label: 'Fecha', value: 'fecha' },
      { label: 'Ingresos Totales', value: 'ingresosTotales' },
      { label: 'Depósitos', value: 'depositos' },
      { label: 'Pagado', value: 'pagado' },
      { label: 'Saldo Pendiente', value: 'saldoPendiente' },
      { label: 'Cantidad Reservas', value: 'cantidadReservas' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `resumen_financiero_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting financial summary:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export pending payments to CSV
router.get('/pending-payments/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, clientId } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { 
      establishmentId,
      status: { [Op.notIn]: ['cancelled', 'no_show'] }
    };

    // Only get bookings with pending balance
    where[Op.and] = [
      sequelize.where(
        sequelize.literal('("Booking"."totalAmount" - COALESCE("Booking"."paidAmount", 0))'),
        { [Op.gt]: 0 }
      )
    ];

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }

    const bookings = await Booking.findAll({
      where,
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name'] }
      ],
      order: [['date', 'ASC']]
    });

    const csvUtils = require('../utils/csvGenerator');

    const today = new Date();
    const csvData = bookings.map(booking => {
      const bookingDate = new Date(booking.date);
      const daysOverdue = Math.max(0, Math.floor((today - bookingDate) / (1000 * 60 * 60 * 24)));
      const pending = parseFloat(booking.totalAmount || 0) - parseFloat(booking.paidAmount || 0);

      return {
        cliente: booking.clientName || '-',
        telefono: booking.clientPhone || '-',
        email: booking.clientEmail || '-',
        fechaReserva: csvUtils.formatDateForCSV(booking.date),
        cancha: booking.court?.name || '-',
        montoTotal: csvUtils.formatNumberForCSV(booking.totalAmount || 0),
        pagado: csvUtils.formatNumberForCSV(booking.paidAmount || 0),
        pendiente: csvUtils.formatNumberForCSV(pending),
        diasAtraso: daysOverdue
      };
    });

    const fields = [
      { label: 'Cliente', value: 'cliente' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Email', value: 'email' },
      { label: 'Fecha Reserva', value: 'fechaReserva' },
      { label: 'Cancha', value: 'cancha' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: 'Pagado', value: 'pagado' },
      { label: 'Pendiente', value: 'pendiente' },
      { label: 'Días de Atraso', value: 'diasAtraso' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `pagos_pendientes_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting pending payments:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
