const { Booking, Court, Establishment, Payment, Order, Invoice } = require('../models');
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

    // Get current period bookings (revenue from reservations)
    const currentBookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.between]: [startStr, endStr] },
        status: { [Op.in]: ['confirmed', 'completed'] }
      },
      include: [
        { model: Court, as: 'court', attributes: ['id', 'name'] },
        { model: Invoice, as: 'invoice', attributes: ['id', 'status', 'anuladoPorId', 'tipoComprobante', 'importeTotal'] }
      ]
    });

    // Get current period orders (direct sales + kiosk/product sales)
    const currentOrders = await Order.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.between]: [start, now] },
        status: { [Op.in]: ['completed', 'pending'] }
      },
      include: [
        { model: Invoice, as: 'invoice', attributes: ['id', 'status', 'anuladoPorId', 'tipoComprobante', 'importeTotal'] }
      ]
    });

    // Get previous period bookings for comparison
    const previousBookings = await Booking.findAll({
      where: {
        establishmentId,
        date: { [Op.between]: [previousStartStr, previousEndStr] },
        status: { [Op.in]: ['confirmed', 'completed'] }
      }
    });

    // Get previous period orders for comparison
    const previousOrders = await Order.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.between]: [previousStart, previousEnd] },
        status: { [Op.in]: ['completed', 'pending'] }
      }
    });

    // Calculate booking revenue
    const bookingRevenue = currentBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    
    // Calculate order revenue (kiosk/product sales)
    const orderRevenue = currentOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
    
    // Total revenue = bookings + orders
    const totalRevenue = bookingRevenue + orderRevenue;
    
    // Previous period totals
    const previousBookingRevenue = previousBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const previousOrderRevenue = previousOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
    const previousRevenue = previousBookingRevenue + previousOrderRevenue;
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Calculate deposits/advances (only from bookings)
    const totalDeposits = currentBookings.reduce((sum, b) => sum + parseFloat(b.depositAmount || 0), 0);
    const pendingBalance = bookingRevenue - totalDeposits;

    // Calculate invoiced vs non-invoiced amounts
    // A sale is "invoiced" if it has an invoice that is NOT cancelled (status != 'anulado' and anuladoPorId is null)
    let totalInvoiced = 0;
    let totalNotInvoiced = 0;

    // Check bookings
    for (const booking of currentBookings) {
      const amount = parseFloat(booking.totalAmount || 0);
      if (booking.invoice && booking.invoice.status === 'emitido' && !booking.invoice.anuladoPorId) {
        totalInvoiced += amount;
      } else {
        totalNotInvoiced += amount;
      }
    }

    // Check orders
    for (const order of currentOrders) {
      const amount = parseFloat(order.total || 0);
      if (order.invoice && order.invoice.status === 'emitido' && !order.invoice.anuladoPorId) {
        totalInvoiced += amount;
      } else {
        totalNotInvoiced += amount;
      }
    }

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
        bookingRevenue,
        orderRevenue,
        totalDeposits,
        pendingBalance,
        pendingPayments,
        totalInvoiced,
        totalNotInvoiced,
        totalBookings: currentBookings.length,
        totalOrders: currentOrders.length,
        averageTicket: currentBookings.length > 0 ? bookingRevenue / currentBookings.length : 0,
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

/**
 * Get sales by product and payment method
 */
const getSalesByProductAndPaymentMethod = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let start;
    
    switch (period) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const { Order, OrderItem, OrderPayment, Product, PaymentMethod } = require('../models');

    // Get all orders in the period
    const orders = await Order.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.gte]: start },
        status: { [Op.in]: ['completed', 'pending'] }
      },
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: OrderPayment,
          as: 'payments',
          attributes: ['id', 'amount', 'paymentMethod']
        }
      ]
    });

    // Get payment methods for the establishment
    const paymentMethods = await PaymentMethod.findAll({
      where: { establishmentId, isActive: true },
      order: [['sortOrder', 'ASC']]
    });

    // Create a map to store sales by product and payment method
    const salesByProduct = {};

    orders.forEach(order => {
      const orderPayments = order.payments || [];
      
      order.items.forEach(item => {
        const productId = item.productId;
        const productName = item.product?.name || item.productName;
        
        if (!salesByProduct[productId]) {
          salesByProduct[productId] = {
            productId,
            productName,
            totalQuantity: 0,
            totalAmount: 0,
            byPaymentMethod: {}
          };
        }

        const itemTotal = parseFloat(item.totalPrice || 0);
        salesByProduct[productId].totalQuantity += item.quantity;
        salesByProduct[productId].totalAmount += itemTotal;

        // Distribute the item total across payment methods proportionally
        if (orderPayments.length > 0) {
          const orderTotal = parseFloat(order.total || 0);
          const itemProportion = orderTotal > 0 ? itemTotal / orderTotal : 0;

          orderPayments.forEach(payment => {
            const method = payment.paymentMethod;
            const paymentAmount = parseFloat(payment.amount || 0);
            const itemPaymentAmount = paymentAmount * itemProportion;

            if (!salesByProduct[productId].byPaymentMethod[method]) {
              salesByProduct[productId].byPaymentMethod[method] = 0;
            }
            salesByProduct[productId].byPaymentMethod[method] += itemPaymentAmount;
          });
        } else {
          // If no payments, use the order's paymentMethod
          const method = order.paymentMethod || 'pending';
          if (!salesByProduct[productId].byPaymentMethod[method]) {
            salesByProduct[productId].byPaymentMethod[method] = 0;
          }
          salesByProduct[productId].byPaymentMethod[method] += itemTotal;
        }
      });
    });

    // Convert to array and format
    const productSales = Object.values(salesByProduct).map(product => {
      const paymentMethodBreakdown = {};
      
      // Initialize all payment methods with 0
      paymentMethods.forEach(pm => {
        paymentMethodBreakdown[pm.code] = {
          name: pm.name,
          amount: 0
        };
      });

      // Fill in actual amounts
      Object.entries(product.byPaymentMethod).forEach(([method, amount]) => {
        if (paymentMethodBreakdown[method]) {
          paymentMethodBreakdown[method].amount = amount;
        } else {
          // Handle legacy or unmapped payment methods
          paymentMethodBreakdown[method] = {
            name: getPaymentMethodLabel(method),
            amount
          };
        }
      });

      return {
        productId: product.productId,
        productName: product.productName,
        totalQuantity: product.totalQuantity,
        totalAmount: product.totalAmount,
        paymentMethods: paymentMethodBreakdown
      };
    });

    // Sort by total amount descending
    productSales.sort((a, b) => b.totalAmount - a.totalAmount);

    res.json({
      success: true,
      period: {
        start: start.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        label: period
      },
      paymentMethods: paymentMethods.map(pm => ({
        code: pm.code,
        name: pm.name,
        icon: pm.icon
      })),
      products: productSales
    });

  } catch (error) {
    console.error('Sales by product and payment method error:', error);
    res.status(500).json({
      error: 'Failed to get sales by product and payment method',
      message: error.message
    });
  }
};

module.exports = {
  getFinancialSummary,
  getPendingPayments,
  getSalesByProductAndPaymentMethod
};
