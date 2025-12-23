const { Booking, Court, Establishment, User, Client } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

/**
 * Get comprehensive analytics for an establishment
 */
const getEstablishmentAnalytics = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { startDate, endDate, period = '30d' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let start, end, previousStart, previousEnd;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      const diff = end - start;
      previousStart = new Date(start - diff);
      previousEnd = new Date(start);
    } else {
      end = now;
      switch (period) {
        case '7d':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          previousStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
          previousEnd = start;
          break;
        case '90d':
          start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          previousStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000);
          previousEnd = start;
          break;
        case '1y':
          start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          previousStart = new Date(start.getTime() - 365 * 24 * 60 * 60 * 1000);
          previousEnd = start;
          break;
        case '30d':
        default:
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          previousStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
          previousEnd = start;
          break;
      }
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const previousStartStr = previousStart.toISOString().split('T')[0];
    const previousEndStr = previousEnd.toISOString().split('T')[0];

    // Get current period bookings
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
    const currentRevenue = currentBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const previousRevenue = previousBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const revenueChange = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Calculate reservations
    const currentReservations = currentBookings.length;
    const previousReservations = previousBookings.length;
    const reservationsChange = previousReservations > 0 ? ((currentReservations - previousReservations) / previousReservations) * 100 : 0;

    // Get unique customers
    const currentCustomers = new Set(currentBookings.map(b => b.clientEmail || b.userId)).size;
    const previousCustomers = new Set(previousBookings.map(b => b.clientEmail || b.userId)).size;
    const customersChange = previousCustomers > 0 ? ((currentCustomers - previousCustomers) / previousCustomers) * 100 : 0;

    // Get courts for occupancy calculation
    const courts = await Court.findAll({
      where: { establishmentId, isActive: true }
    });

    // Calculate occupancy (assuming 14 hours per day, 08:00-22:00)
    const hoursPerDay = 14;
    const daysInPeriod = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
    const totalPossibleHours = courts.length * hoursPerDay * daysInPeriod;
    const bookedHours = currentBookings.reduce((sum, b) => sum + (b.duration || 60) / 60, 0);
    const currentOccupancy = totalPossibleHours > 0 ? (bookedHours / totalPossibleHours) * 100 : 0;

    const previousDaysInPeriod = Math.ceil((previousEnd - previousStart) / (24 * 60 * 60 * 1000));
    const previousTotalPossibleHours = courts.length * hoursPerDay * previousDaysInPeriod;
    const previousBookedHours = previousBookings.reduce((sum, b) => sum + (b.duration || 60) / 60, 0);
    const previousOccupancy = previousTotalPossibleHours > 0 ? (previousBookedHours / previousTotalPossibleHours) * 100 : 0;
    const occupancyChange = previousOccupancy > 0 ? ((currentOccupancy - previousOccupancy) / previousOccupancy) * 100 : 0;

    // Revenue by day
    const revenueByDay = {};
    currentBookings.forEach(b => {
      if (!revenueByDay[b.date]) {
        revenueByDay[b.date] = { revenue: 0, reservations: 0 };
      }
      revenueByDay[b.date].revenue += parseFloat(b.totalAmount || 0);
      revenueByDay[b.date].reservations += 1;
    });

    const dailyRevenue = Object.entries(revenueByDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Court utilization
    const courtUtilization = courts.map(court => {
      const courtBookings = currentBookings.filter(b => b.courtId === court.id);
      const courtRevenue = courtBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
      const courtHours = courtBookings.reduce((sum, b) => sum + (b.duration || 60) / 60, 0);
      const courtPossibleHours = hoursPerDay * daysInPeriod;
      const utilization = courtPossibleHours > 0 ? (courtHours / courtPossibleHours) * 100 : 0;

      return {
        courtId: court.id,
        court: court.name,
        utilization: Math.round(utilization * 10) / 10,
        revenue: courtRevenue,
        reservations: courtBookings.length,
        averageBookingValue: courtBookings.length > 0 ? courtRevenue / courtBookings.length : 0
      };
    });

    // Peak hours analysis
    const hourCounts = {};
    for (let i = 6; i <= 23; i++) {
      hourCounts[i] = { count: 0, revenue: 0 };
    }
    currentBookings.forEach(b => {
      const hour = parseInt(b.startTime?.substring(0, 2) || '0');
      if (hourCounts[hour]) {
        hourCounts[hour].count += 1;
        hourCounts[hour].revenue += parseFloat(b.totalAmount || 0);
      }
    });

    const peakHours = Object.entries(hourCounts)
      .map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        reservations: data.count,
        revenue: data.revenue
      }))
      .sort((a, b) => b.reservations - a.reservations);

    // Day of week analysis
    const dayOfWeekCounts = {
      0: { name: 'Domingo', count: 0, revenue: 0 },
      1: { name: 'Lunes', count: 0, revenue: 0 },
      2: { name: 'Martes', count: 0, revenue: 0 },
      3: { name: 'Miércoles', count: 0, revenue: 0 },
      4: { name: 'Jueves', count: 0, revenue: 0 },
      5: { name: 'Viernes', count: 0, revenue: 0 },
      6: { name: 'Sábado', count: 0, revenue: 0 }
    };
    currentBookings.forEach(b => {
      const dayOfWeek = new Date(b.date).getDay();
      dayOfWeekCounts[dayOfWeek].count += 1;
      dayOfWeekCounts[dayOfWeek].revenue += parseFloat(b.totalAmount || 0);
    });

    const dayOfWeekStats = Object.values(dayOfWeekCounts);

    // Booking type breakdown
    const bookingTypes = {};
    currentBookings.forEach(b => {
      const type = b.bookingType || 'normal';
      if (!bookingTypes[type]) {
        bookingTypes[type] = { count: 0, revenue: 0 };
      }
      bookingTypes[type].count += 1;
      bookingTypes[type].revenue += parseFloat(b.totalAmount || 0);
    });

    const bookingTypeStats = Object.entries(bookingTypes).map(([type, data]) => ({
      type,
      count: data.count,
      revenue: data.revenue,
      percentage: currentReservations > 0 ? (data.count / currentReservations) * 100 : 0
    }));

    // Cancellation rate
    const cancelledBookings = await Booking.count({
      where: {
        establishmentId,
        date: { [Op.between]: [startStr, endStr] },
        status: 'cancelled'
      }
    });
    const totalBookingsIncludingCancelled = currentReservations + cancelledBookings;
    const cancellationRate = totalBookingsIncludingCancelled > 0 
      ? (cancelledBookings / totalBookingsIncludingCancelled) * 100 
      : 0;

    // Average booking value
    const averageBookingValue = currentReservations > 0 ? currentRevenue / currentReservations : 0;
    const previousAverageBookingValue = previousReservations > 0 ? previousRevenue / previousReservations : 0;

    // Deposit stats
    const totalDeposits = currentBookings.reduce((sum, b) => sum + parseFloat(b.depositAmount || 0), 0);
    const bookingsWithDeposit = currentBookings.filter(b => parseFloat(b.depositAmount || 0) > 0).length;

    res.json({
      success: true,
      period: {
        start: startStr,
        end: endStr,
        previousStart: previousStartStr,
        previousEnd: previousEndStr,
        label: period
      },
      summary: {
        revenue: {
          current: currentRevenue,
          previous: previousRevenue,
          change: Math.round(revenueChange * 10) / 10,
          trend: revenueChange > 0 ? 'up' : revenueChange < 0 ? 'down' : 'stable'
        },
        reservations: {
          current: currentReservations,
          previous: previousReservations,
          change: Math.round(reservationsChange * 10) / 10,
          trend: reservationsChange > 0 ? 'up' : reservationsChange < 0 ? 'down' : 'stable'
        },
        customers: {
          current: currentCustomers,
          previous: previousCustomers,
          change: Math.round(customersChange * 10) / 10,
          trend: customersChange > 0 ? 'up' : customersChange < 0 ? 'down' : 'stable'
        },
        occupancy: {
          current: Math.round(currentOccupancy * 10) / 10,
          previous: Math.round(previousOccupancy * 10) / 10,
          change: Math.round(occupancyChange * 10) / 10,
          trend: occupancyChange > 0 ? 'up' : occupancyChange < 0 ? 'down' : 'stable'
        },
        averageBookingValue: {
          current: Math.round(averageBookingValue),
          previous: Math.round(previousAverageBookingValue)
        },
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        deposits: {
          total: totalDeposits,
          bookingsWithDeposit,
          percentage: currentReservations > 0 ? Math.round((bookingsWithDeposit / currentReservations) * 100) : 0
        }
      },
      charts: {
        dailyRevenue,
        courtUtilization,
        peakHours,
        dayOfWeek: dayOfWeekStats,
        bookingTypes: bookingTypeStats
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to get analytics',
      message: error.message
    });
  }
};

/**
 * Get top customers for an establishment
 */
const getTopCustomers = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { limit = 10, period = '30d' } = req.query;

    const now = new Date();
    let start;
    switch (period) {
      case '7d': start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '90d': start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      case '1y': start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
      default: start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = now.toISOString().split('T')[0];

    const bookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.between]: [startStr, endStr] },
        status: { [Op.in]: ['confirmed', 'completed'] }
      }
    });

    // Group by customer
    const customerStats = {};
    bookings.forEach(b => {
      const key = b.clientEmail || b.clientPhone || b.userId || 'unknown';
      if (!customerStats[key]) {
        customerStats[key] = {
          name: b.clientName || 'Cliente',
          email: b.clientEmail || '',
          phone: b.clientPhone || '',
          totalBookings: 0,
          totalRevenue: 0,
          lastBooking: null
        };
      }
      customerStats[key].totalBookings += 1;
      customerStats[key].totalRevenue += parseFloat(b.totalAmount || 0);
      if (!customerStats[key].lastBooking || b.date > customerStats[key].lastBooking) {
        customerStats[key].lastBooking = b.date;
      }
    });

    const topCustomers = Object.values(customerStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      topCustomers
    });

  } catch (error) {
    console.error('Top customers error:', error);
    res.status(500).json({
      error: 'Failed to get top customers',
      message: error.message
    });
  }
};

module.exports = {
  getEstablishmentAnalytics,
  getTopCustomers
};
