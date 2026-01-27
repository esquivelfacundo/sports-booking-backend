const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getEstablishmentAnalytics,
  getTopCustomers
} = require('../controllers/analyticsController');
const { Booking, Court, Client, Establishment } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get comprehensive analytics for an establishment
router.get('/establishment/:establishmentId', getEstablishmentAnalytics);

// Get top customers
router.get('/establishment/:establishmentId/top-customers', getTopCustomers);

// Export court occupancy to CSV
router.get('/court-occupancy/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate } = req.query;

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

    const bookingWhere = { status: { [Op.in]: ['confirmed', 'completed'] } };
    if (startDate) bookingWhere.date = { [Op.gte]: startDate };
    if (endDate) bookingWhere.date = { ...bookingWhere.date, [Op.lte]: endDate };

    const courts = await Court.findAll({
      where: { establishmentId, isActive: true },
      include: [{
        model: Booking,
        as: 'bookings',
        where: bookingWhere,
        required: false,
        attributes: ['id', 'totalAmount', 'startTime', 'endTime']
      }]
    });

    const csvUtils = require('../utils/csvGenerator');

    const csvData = courts.map(court => {
      const bookings = court.bookings || [];
      const totalBookings = bookings.length;
      let totalHours = 0;
      let totalRevenue = 0;

      bookings.forEach(b => {
        const start = new Date(`2000-01-01T${b.startTime}`);
        const end = new Date(`2000-01-01T${b.endTime}`);
        totalHours += (end - start) / (1000 * 60 * 60);
        totalRevenue += parseFloat(b.totalAmount || 0);
      });

      return {
        cancha: court.name,
        deporte: court.sportType || '-',
        reservasTotales: totalBookings,
        horasOcupadas: totalHours.toFixed(1),
        ingresosTotales: csvUtils.formatNumberForCSV(totalRevenue),
        ticketPromedio: csvUtils.formatNumberForCSV(totalBookings > 0 ? totalRevenue / totalBookings : 0)
      };
    });

    const fields = [
      { label: 'Cancha', value: 'cancha' },
      { label: 'Deporte', value: 'deporte' },
      { label: 'Reservas Totales', value: 'reservasTotales' },
      { label: 'Horas Ocupadas', value: 'horasOcupadas' },
      { label: 'Ingresos Totales', value: 'ingresosTotales' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ocupacion_canchas_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting court occupancy:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export top clients to CSV
router.get('/top-clients/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, limit = 100 } = req.query;

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

    const clients = await Client.findAll({
      where: { establishmentId, isActive: true },
      order: [['totalSpent', 'DESC'], ['completedBookings', 'DESC']],
      limit: parseInt(limit)
    });

    const csvUtils = require('../utils/csvGenerator');

    const csvData = clients.map((client, index) => ({
      ranking: index + 1,
      nombre: client.name,
      telefono: client.phone || '-',
      email: client.email || '-',
      reservasTotales: client.totalBookings || 0,
      reservasCompletadas: client.completedBookings || 0,
      totalGastado: csvUtils.formatNumberForCSV(client.totalSpent),
      ticketPromedio: csvUtils.formatNumberForCSV(client.completedBookings > 0 ? client.totalSpent / client.completedBookings : 0),
      ultimaReserva: client.lastBookingDate ? csvUtils.formatDateForCSV(client.lastBookingDate) : '-'
    }));

    const fields = [
      { label: 'Ranking', value: 'ranking' },
      { label: 'Nombre', value: 'nombre' },
      { label: 'Teléfono', value: 'telefono' },
      { label: 'Email', value: 'email' },
      { label: 'Reservas Totales', value: 'reservasTotales' },
      { label: 'Reservas Completadas', value: 'reservasCompletadas' },
      { label: 'Total Gastado', value: 'totalGastado' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' },
      { label: 'Última Reserva', value: 'ultimaReserva' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `clientes_frecuentes_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting top clients:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export revenue by weekday to CSV
router.get('/by-weekday/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate } = req.query;

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

    const bookingWhere = { 
      establishmentId,
      status: { [Op.in]: ['confirmed', 'completed'] }
    };
    if (startDate) bookingWhere.date = { [Op.gte]: startDate };
    if (endDate) bookingWhere.date = { ...bookingWhere.date, [Op.lte]: endDate };

    const bookings = await Booking.findAll({
      where: bookingWhere,
      attributes: ['date', 'totalAmount', 'startTime', 'endTime']
    });

    const dayStats = {};
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    bookings.forEach(b => {
      const dayOfWeek = new Date(b.date).getDay();
      if (!dayStats[dayOfWeek]) {
        dayStats[dayOfWeek] = { dayOfWeek, count: 0, revenue: 0, hours: 0 };
      }
      dayStats[dayOfWeek].count++;
      dayStats[dayOfWeek].revenue += parseFloat(b.totalAmount || 0);
      
      const start = new Date(`2000-01-01T${b.startTime}`);
      const end = new Date(`2000-01-01T${b.endTime}`);
      dayStats[dayOfWeek].hours += (end - start) / (1000 * 60 * 60);
    });

    const csvUtils = require('../utils/csvGenerator');
    const totalRevenue = Object.values(dayStats).reduce((sum, d) => sum + d.revenue, 0);

    const csvData = Object.values(dayStats).sort((a, b) => a.dayOfWeek - b.dayOfWeek).map(stat => ({
      dia: dayNames[stat.dayOfWeek],
      cantidadReservas: stat.count,
      horasReservadas: stat.hours.toFixed(1),
      ingresosTotales: csvUtils.formatNumberForCSV(stat.revenue),
      ticketPromedio: csvUtils.formatNumberForCSV(stat.count > 0 ? stat.revenue / stat.count : 0),
      porcentaje: totalRevenue > 0 ? ((stat.revenue / totalRevenue) * 100).toFixed(2) + '%' : '0%'
    }));

    const fields = [
      { label: 'Día', value: 'dia' },
      { label: 'Cantidad Reservas', value: 'cantidadReservas' },
      { label: 'Horas Reservadas', value: 'horasReservadas' },
      { label: 'Ingresos Totales', value: 'ingresosTotales' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' },
      { label: 'Porcentaje', value: 'porcentaje' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `rendimiento_por_dia_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting by weekday:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export revenue by court to CSV
router.get('/revenue-by-court/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate } = req.query;

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

    const bookingWhere = { status: { [Op.in]: ['confirmed', 'completed'] } };
    if (startDate) bookingWhere.date = { [Op.gte]: startDate };
    if (endDate) bookingWhere.date = { ...bookingWhere.date, [Op.lte]: endDate };

    const courts = await Court.findAll({
      where: { establishmentId, isActive: true },
      include: [{
        model: Booking,
        as: 'bookings',
        where: bookingWhere,
        required: false,
        attributes: ['id', 'totalAmount', 'depositAmount', 'status']
      }]
    });

    const csvUtils = require('../utils/csvGenerator');
    let totalGeneral = 0;

    const courtData = courts.map(court => {
      const bookings = court.bookings || [];
      const totalBookings = bookings.length;
      let totalRevenue = 0;
      let totalDeposits = 0;

      bookings.forEach(b => {
        totalRevenue += parseFloat(b.totalAmount || 0);
        totalDeposits += parseFloat(b.depositAmount || 0);
      });

      totalGeneral += totalRevenue;

      return {
        court,
        totalBookings,
        totalRevenue,
        totalDeposits
      };
    });

    const csvData = courtData.map(cd => ({
      cancha: cd.court.name,
      deporte: cd.court.sportType || '-',
      cantidadReservas: cd.totalBookings,
      ingresosTotales: csvUtils.formatNumberForCSV(cd.totalRevenue),
      depositos: csvUtils.formatNumberForCSV(cd.totalDeposits),
      ticketPromedio: csvUtils.formatNumberForCSV(cd.totalBookings > 0 ? cd.totalRevenue / cd.totalBookings : 0),
      porcentaje: totalGeneral > 0 ? ((cd.totalRevenue / totalGeneral) * 100).toFixed(2) + '%' : '0%'
    }));

    const fields = [
      { label: 'Cancha', value: 'cancha' },
      { label: 'Deporte', value: 'deporte' },
      { label: 'Cantidad Reservas', value: 'cantidadReservas' },
      { label: 'Ingresos Totales', value: 'ingresosTotales' },
      { label: 'Depósitos', value: 'depositos' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' },
      { label: 'Porcentaje', value: 'porcentaje' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ingresos_por_cancha_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting revenue by court:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export peak hours to CSV
router.get('/peak-hours/export', async (req, res) => {
  try {
    const { establishmentId, startDate, endDate } = req.query;

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

    const bookingWhere = { 
      establishmentId,
      status: { [Op.in]: ['confirmed', 'completed'] }
    };
    if (startDate) bookingWhere.date = { [Op.gte]: startDate };
    if (endDate) bookingWhere.date = { ...bookingWhere.date, [Op.lte]: endDate };

    const bookings = await Booking.findAll({
      where: bookingWhere,
      attributes: ['startTime', 'date', 'totalAmount']
    });

    const hourStats = {};
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    bookings.forEach(b => {
      const hour = parseInt(b.startTime.split(':')[0]);
      const dayOfWeek = new Date(b.date).getDay();
      const key = `${hour}-${dayOfWeek}`;

      if (!hourStats[key]) {
        hourStats[key] = { hour, dayOfWeek, count: 0, revenue: 0 };
      }
      hourStats[key].count++;
      hourStats[key].revenue += parseFloat(b.totalAmount || 0);
    });

    const sortedStats = Object.values(hourStats).sort((a, b) => b.count - a.count);
    const csvUtils = require('../utils/csvGenerator');

    const csvData = sortedStats.map(stat => ({
      hora: `${stat.hour.toString().padStart(2, '0')}:00`,
      diaSemana: dayNames[stat.dayOfWeek],
      cantidadReservas: stat.count,
      ingresosTotales: csvUtils.formatNumberForCSV(stat.revenue),
      promedioIngreso: csvUtils.formatNumberForCSV(stat.count > 0 ? stat.revenue / stat.count : 0)
    }));

    const fields = [
      { label: 'Hora', value: 'hora' },
      { label: 'Día de Semana', value: 'diaSemana' },
      { label: 'Cantidad Reservas', value: 'cantidadReservas' },
      { label: 'Ingresos Totales', value: 'ingresosTotales' },
      { label: 'Promedio Ingreso', value: 'promedioIngreso' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `horarios_pico_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting peak hours:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
