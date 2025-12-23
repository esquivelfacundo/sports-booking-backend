const { Booking, Court, Establishment, Payment } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

/**
 * Get financial summary for an establishment
 */
const getFinancialSummary = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let start, previousStart, previousEnd;
    
    switch (period) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousEnd = start;
        break;
      case 'quarter':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousEnd = start;
        break;
      case 'year':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        previousStart = new Date(start.getTime() - 365 * 24 * 60 * 60 * 1000);
        previousEnd = start;
        break;
      case 'month':
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousEnd = start;
        break;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = now.toISOString().split('T')[0];
    const previousStartStr = previousStart.toISOString().split('T')[0];
    const previousEndStr = previousEnd.toISOString().split('T')[0];

    // Get current period bookings (revenue)
    const currentBookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.between]: [startStr, endStr] },
        status: { [Op.in]: ['confirmed', 'completed'] }
      },
      include: [{ model: Court, as: 'court', attributes: ['id', 'name'] }]
    });

    // Get previous period bookings for comparison
    const previousBookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.between]: [previousStartStr, previousEndStr] },
        status: { [Op.in]: ['confirmed', 'completed'] }
      }
    });

    // Calculate revenue
    const totalRevenue = currentBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const previousRevenue = previousBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Calculate deposits/advances
    const totalDeposits = currentBookings.reduce((sum, b) => sum + parseFloat(b.depositAmount || 0), 0);
    const pendingBalance = totalRevenue - totalDeposits;

    // Pending payments (pending bookings)
    const pendingBookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.gte]: startStr },
        status: 'pending'
      }
    });
    const pendingPayments = pendingBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);

    // Revenue by payment method
    const paymentMethods = {};
    currentBookings.forEach(b => {
      const method = b.depositMethod || 'sin_especificar';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { count: 0, amount: 0 };
      }
      paymentMethods[method].count += 1;
      paymentMethods[method].amount += parseFloat(b.totalAmount || 0);
    });

    // Revenue by court
    const revenueByCourt = {};
    currentBookings.forEach(b => {
      const courtName = b.court?.name || 'Sin cancha';
      if (!revenueByCourt[courtName]) {
        revenueByCourt[courtName] = { count: 0, amount: 0 };
      }
      revenueByCourt[courtName].count += 1;
      revenueByCourt[courtName].amount += parseFloat(b.totalAmount || 0);
    });

    // Revenue by day
    const revenueByDay = {};
    currentBookings.forEach(b => {
      if (!revenueByDay[b.date]) {
        revenueByDay[b.date] = { revenue: 0, deposits: 0, bookings: 0 };
      }
      revenueByDay[b.date].revenue += parseFloat(b.totalAmount || 0);
      revenueByDay[b.date].deposits += parseFloat(b.depositAmount || 0);
      revenueByDay[b.date].bookings += 1;
    });

    const dailyRevenue = Object.entries(revenueByDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by booking type
    const revenueByType = {};
    currentBookings.forEach(b => {
      const type = b.bookingType || 'normal';
      if (!revenueByType[type]) {
        revenueByType[type] = { count: 0, amount: 0 };
      }
      revenueByType[type].count += 1;
      revenueByType[type].amount += parseFloat(b.totalAmount || 0);
    });

    // Recent transactions (bookings as income)
    const recentTransactions = currentBookings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map(b => ({
        id: b.id,
        type: 'income',
        category: 'Reservas',
        description: `${b.court?.name || 'Cancha'} - ${b.clientName || 'Cliente'}`,
        amount: parseFloat(b.totalAmount || 0),
        depositAmount: parseFloat(b.depositAmount || 0),
        date: b.date,
        time: b.startTime,
        status: b.status === 'completed' ? 'completed' : b.status === 'confirmed' ? 'completed' : 'pending',
        paymentMethod: b.depositMethod || 'efectivo',
        reference: b.checkInCode,
        clientName: b.clientName,
        clientPhone: b.clientPhone,
        court: b.court?.name
      }));

    // Monthly comparison
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const monthEndStr = monthEnd.toISOString().split('T')[0];
      
      const monthBookings = await Booking.findAll({
        where: {
          establishmentId,
          date: { [Op.between]: [monthStartStr, monthEndStr] },
          status: { [Op.in]: ['confirmed', 'completed'] }
        }
      });
      
      const monthRevenue = monthBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
      const monthDeposits = monthBookings.reduce((sum, b) => sum + parseFloat(b.depositAmount || 0), 0);
      
      monthlyData.push({
        month: monthStart.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
        revenue: monthRevenue,
        deposits: monthDeposits,
        bookings: monthBookings.length
      });
    }

    res.json({
      success: true,
      period: {
        start: startStr,
        end: endStr,
        label: period
      },
      summary: {
        totalRevenue,
        totalDeposits,
        pendingBalance,
        pendingPayments,
        totalBookings: currentBookings.length,
        averageTicket: currentBookings.length > 0 ? totalRevenue / currentBookings.length : 0,
        growth: {
          revenue: Math.round(revenueGrowth * 10) / 10,
          trend: revenueGrowth > 0 ? 'up' : revenueGrowth < 0 ? 'down' : 'stable'
        }
      },
      breakdown: {
        byPaymentMethod: Object.entries(paymentMethods).map(([method, data]) => ({
          method: getPaymentMethodLabel(method),
          ...data,
          percentage: totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0
        })),
        byCourt: Object.entries(revenueByCourt).map(([court, data]) => ({
          court,
          ...data,
          percentage: totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0
        })),
        byType: Object.entries(revenueByType).map(([type, data]) => ({
          type: getBookingTypeLabel(type),
          ...data,
          percentage: totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0
        }))
      },
      charts: {
        dailyRevenue,
        monthlyComparison: monthlyData
      },
      transactions: recentTransactions
    });

  } catch (error) {
    console.error('Finance summary error:', error);
    res.status(500).json({
      error: 'Failed to get financial summary',
      message: error.message
    });
  }
};

const getPaymentMethodLabel = (method) => {
  const labels = {
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia',
    'tarjeta': 'Tarjeta',
    'mercadopago': 'MercadoPago',
    'sin_especificar': 'Sin especificar'
  };
  return labels[method] || method;
};

const getBookingTypeLabel = (type) => {
  const labels = {
    'normal': 'Normal',
    'profesor': 'Profesor',
    'torneo': 'Torneo',
    'escuela': 'Escuela',
    'cumpleanos': 'Cumpleaños',
    'abonado': 'Abonado'
  };
  return labels[type] || type;
};

/**
 * Get pending payments details
 */
const getPendingPayments = async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const pendingBookings = await Booking.findAll({
      where: {
        establishmentId,
        status: { [Op.in]: ['pending', 'confirmed'] },
        date: { [Op.gte]: new Date().toISOString().split('T')[0] }
      },
      include: [{ model: Court, as: 'court', attributes: ['id', 'name'] }],
      order: [['date', 'ASC'], ['startTime', 'ASC']]
    });

    const pendingPayments = pendingBookings
      .filter(b => {
        const totalAmount = parseFloat(b.totalAmount || 0);
        const depositAmount = parseFloat(b.depositAmount || 0);
        return totalAmount > depositAmount; // Has pending balance
      })
      .map(b => ({
        id: b.id,
        clientName: b.clientName,
        clientPhone: b.clientPhone,
        court: b.court?.name,
        date: b.date,
        time: b.startTime,
        totalAmount: parseFloat(b.totalAmount || 0),
        depositAmount: parseFloat(b.depositAmount || 0),
        pendingAmount: parseFloat(b.totalAmount || 0) - parseFloat(b.depositAmount || 0),
        status: b.status
      }));

    const totalPending = pendingPayments.reduce((sum, p) => sum + p.pendingAmount, 0);

    res.json({
      success: true,
      totalPending,
      count: pendingPayments.length,
      payments: pendingPayments
    });

  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({
      error: 'Failed to get pending payments',
      message: error.message
    });
  }
};

module.exports = {
  getFinancialSummary,
  getPendingPayments
};
