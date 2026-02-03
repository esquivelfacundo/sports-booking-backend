const { Booking, Court, Establishment, Payment, Order, Invoice, Client, BookingConsumption, Product, BookingPayment, OrderItem, EstablishmentUser, PaymentMethod } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

/**
 * Get financial summary for an establishment
 */
const getFinancialSummary = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { period = 'month', startDate, endDate } = req.query;

    // Calculate date range based on period or custom dates
    const now = new Date();
    let start, end, previousStart, previousEnd;
    
    if (period === 'custom' && startDate) {
      // Custom date range - use date strings directly to avoid ALL timezone issues
      // If only startDate is provided, use today as endDate
      const todayStr = now.toISOString().split('T')[0];
      const effectiveEndDate = endDate || todayStr;
      
      // Store strings directly - these will be used for DB queries and chart generation
      const customStartStr = startDate;
      const customEndStr = effectiveEndDate;
      
      // Create Date objects only for calculating previous period (not for DB queries)
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = effectiveEndDate.split('-').map(Number);
      start = new Date(sy, sm - 1, sd);
      end = new Date(ey, em - 1, ed);
      
      const rangeDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
      previousStart = new Date(start.getTime() - rangeDays * 24 * 60 * 60 * 1000);
      previousEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      
      // Store original strings for direct use (avoids any timezone conversion)
      start.dateStr = customStartStr;
      end.dateStr = customEndStr;
    } else {
      end = now;
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
    }

    // Use stored date strings for custom period, otherwise convert from Date
    const startStr = start.dateStr || start.toISOString().split('T')[0];
    const endStr = end.dateStr || end.toISOString().split('T')[0];
    const previousStartStr = previousStart.toISOString().split('T')[0];
    const previousEndStr = previousEnd.toISOString().split('T')[0];

    // Load payment methods for this establishment to create code -> name mapping
    const establishmentPaymentMethods = await PaymentMethod.findAll({
      where: { establishmentId, isActive: true },
      attributes: ['code', 'name'],
      raw: true
    });
    
    // Create code -> name mapping (use first found name for each code to handle duplicates)
    const paymentMethodNameMap = {};
    establishmentPaymentMethods.forEach(pm => {
      if (!paymentMethodNameMap[pm.code]) {
        paymentMethodNameMap[pm.code] = pm.name;
      }
    });
    
    // Helper to get payment method name from code
    const getMethodName = (code) => {
      if (!code) return 'Sin especificar';
      // First try establishment's payment methods
      if (paymentMethodNameMap[code]) return paymentMethodNameMap[code];
      // Fallback to hardcoded labels for legacy codes
      const fallbackLabels = {
        'efectivo': 'Efectivo', 'cash': 'Efectivo',
        'transferencia': 'Transferencia', 'transfer': 'Transferencia',
        'tarjeta': 'Tarjeta', 'card': 'Tarjeta',
        'mercadopago': 'MercadoPago',
        'pending': 'Pendiente de Cobro', 'pendiente': 'Pendiente de Cobro',
        'sin_especificar': 'Sin especificar'
      };
      return fallbackLabels[code] || code;
    };

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
    // Use string dates to avoid timezone issues and raw: true for direct data access
    const currentOrdersRaw = await Order.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.between]: [startStr + 'T00:00:00', endStr + 'T23:59:59'] },
        status: { [Op.in]: ['completed', 'pending'] }
      },
      raw: true
    });
    
    // Enrich orders with calculated totals (same logic as /ventas)
    const currentOrders = await Promise.all(currentOrdersRaw.map(async (order) => {
      let calculatedTotal = parseFloat(order.total) || 0;
      let clientName = order.customerName;
      let clientPhone = order.customerPhone;
      
      // Get client if exists
      if (order.clientId && !clientName) {
        const client = await Client.findByPk(order.clientId, { attributes: ['name', 'phone'], raw: true });
        if (client) {
          clientName = client.name;
          clientPhone = client.phone;
        }
      }
      
      // For booking_consumption, calculate total from booking + consumptions
      if (order.orderType === 'booking_consumption' && order.bookingId) {
        const fullBooking = await Booking.findByPk(order.bookingId, {
          attributes: ['id', 'totalAmount', 'depositAmount', 'clientName', 'clientPhone'],
          raw: true
        });
        
        const consumptions = await BookingConsumption.findAll({
          where: { bookingId: order.bookingId },
          raw: true
        });
        
        const consumptionsTotal = consumptions.reduce((sum, c) => sum + (parseFloat(c.totalPrice) || 0), 0);
        const bookingTotal = parseFloat(fullBooking?.totalAmount) || 0;
        calculatedTotal = bookingTotal + consumptionsTotal;
        
        if (!clientName && fullBooking) {
          clientName = fullBooking.clientName;
          clientPhone = fullBooking.clientPhone;
        }
      }
      
      return {
        ...order,
        total: calculatedTotal,
        customerName: clientName || 'Cliente',
        customerPhone: clientPhone || ''
      };
    }));

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

    // Calculate booking revenue (only from bookings table)
    const bookingRevenue = currentBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    
    // Calculate kiosk/product revenue (only products sold, not booking amounts)
    // For direct_sale: sum order total (products only)
    // For booking_consumption: sum only the consumptions (products added to booking)
    let kioskRevenue = 0;
    for (const o of currentOrders) {
      if (o.orderType === 'direct_sale') {
        kioskRevenue += parseFloat(o.total || 0);
      } else if (o.orderType === 'booking_consumption' && o.bookingId) {
        // Only sum the consumptions (products), not the booking amount
        const consumptions = await BookingConsumption.findAll({ where: { bookingId: o.bookingId }, raw: true });
        const consumptionsTotal = consumptions.reduce((sum, c) => sum + (parseFloat(c.totalPrice) || 0), 0);
        kioskRevenue += consumptionsTotal;
      }
    }
    
    // Total revenue = bookings + kiosk products
    const totalRevenue = bookingRevenue + kioskRevenue;
    // Keep orderRevenue for backwards compatibility (now it's just kiosk)
    const orderRevenue = kioskRevenue;
    
    // Previous period totals
    const previousBookingRevenue = previousBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
    const previousOrderRevenue = previousOrders.reduce((sum, o) => parseFloat(o.total || 0), 0);
    const previousRevenue = previousBookingRevenue + previousOrderRevenue;
    const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Calculate deposits/advances (only from bookings)
    const totalDeposits = currentBookings.reduce((sum, b) => sum + parseFloat(b.depositAmount || 0), 0);
    const pendingBalance = bookingRevenue - totalDeposits;
    
    // Calculate totalPaid and totalPending using same logic as /ventas (iterate over orders)
    let totalPaid = 0;
    let totalPending = 0;
    
    for (const o of currentOrders) {
      if (o.orderType === 'booking_consumption' && o.bookingId) {
        // For booking_consumption, calculate like in /ventas
        const fullBooking = await Booking.findByPk(o.bookingId, { raw: true });
        const bookingTotal = parseFloat(fullBooking?.totalAmount) || 0;
        const depositAmount = parseFloat(fullBooking?.depositAmount) || 0;
        const initialDeposit = parseFloat(fullBooking?.initialDeposit) || 0;
        
        // Get consumptions total
        const consumptions = await BookingConsumption.findAll({ where: { bookingId: o.bookingId }, raw: true });
        const consumptionsTotal = consumptions.reduce((sum, c) => sum + (parseFloat(c.totalPrice) || 0), 0);
        
        // Get booking payments
        const bpList = await BookingPayment.findAll({ where: { bookingId: o.bookingId }, raw: true });
        const depPmts = bpList.filter(p => p.paymentType === 'deposit');
        const decPmts = bpList.filter(p => p.paymentType !== 'deposit');
        const seña = depPmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || initialDeposit;
        const bpTotal = decPmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        
        const orderTotal = bookingTotal + consumptionsTotal;
        const orderPaid = seña + bpTotal;
        
        totalPaid += orderPaid;
        totalPending += Math.max(0, orderTotal - orderPaid);
      } else {
        // Direct sale - use order values directly
        const orderTotal = parseFloat(o.total || 0);
        const orderPaid = parseFloat(o.paidAmount || 0);
        totalPaid += orderPaid;
        totalPending += Math.max(0, orderTotal - orderPaid);
      }
    }

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

    // Revenue by payment method - should show PAID amounts, not totals
    const paymentMethods = {};
    
    // For each order, calculate what was actually paid and by which method
    for (const o of currentOrders) {
      if (o.orderType === 'booking_consumption' && o.bookingId) {
        // Get booking payment details
        const fullBooking = await Booking.findByPk(o.bookingId, { raw: true });
        const depositAmount = parseFloat(fullBooking?.depositAmount) || 0;
        const initialDeposit = parseFloat(fullBooking?.initialDeposit) || 0;
        const depositMethod = fullBooking?.depositMethod || 'sin_especificar';
        
        // Get booking payments separated by type
        const bpList = await BookingPayment.findAll({ where: { bookingId: o.bookingId }, raw: true });
        const depositPmts = bpList.filter(p => p.paymentType === 'deposit');
        const declaredPmts = bpList.filter(p => p.paymentType !== 'deposit');
        const seña = depositPmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || initialDeposit;
        
        // Add seña to deposit method
        if (seña > 0) {
          if (!paymentMethods[depositMethod]) {
            paymentMethods[depositMethod] = { count: 0, amount: 0 };
          }
          paymentMethods[depositMethod].count += 1;
          paymentMethods[depositMethod].amount += seña;
        }
        
        // Add each declared payment to its method (not deposits, already counted above)
        for (const bp of declaredPmts) {
          const bpMethod = bp.method || 'cash';
          if (!paymentMethods[bpMethod]) {
            paymentMethods[bpMethod] = { count: 0, amount: 0 };
          }
          paymentMethods[bpMethod].count += 1;
          paymentMethods[bpMethod].amount += parseFloat(bp.amount) || 0;
        }
      } else {
        // Direct sale - use paidAmount
        const method = o.paymentMethod || 'sin_especificar';
        const paidAmount = parseFloat(o.paidAmount || 0);
        if (paidAmount > 0) {
          if (!paymentMethods[method]) {
            paymentMethods[method] = { count: 0, amount: 0 };
          }
          paymentMethods[method].count += 1;
          paymentMethods[method].amount += paidAmount;
        }
      }
    }
    
    // Add "Pendiente de Cobro" as a pseudo payment method showing total pending
    if (totalPending > 0) {
      paymentMethods['pendiente'] = { count: 0, amount: totalPending };
    }

    // Revenue by court (bookings go to their court, ALL product sales go to Kiosco/Ventas)
    const revenueByCourt = {};
    
    // Bookings go to their court
    currentBookings.forEach(b => {
      const courtName = b.court?.name || 'Sin cancha';
      if (!revenueByCourt[courtName]) {
        revenueByCourt[courtName] = { count: 0, amount: 0 };
      }
      revenueByCourt[courtName].count += 1;
      revenueByCourt[courtName].amount += parseFloat(b.totalAmount || 0);
    });
    
    // ALL product sales (direct + booking consumptions) go to Kiosco/Ventas
    // kioskRevenue already has this calculated correctly
    if (kioskRevenue > 0) {
      revenueByCourt['Kiosco/Ventas'] = { count: currentOrders.length, amount: kioskRevenue };
    }

    // Revenue by period (daily for week/month, weekly for quarter/year)
    const useWeeklyGrouping = period === 'quarter' || period === 'year';
    const revenueByPeriod = {};
    
    // Helper to get week key (start of week date) - uses local time formatting
    const getWeekKey = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
      d.setDate(diff);
      // Format manually to avoid timezone issues
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${dayNum}`;
    };
    
    // Initialize all periods with zero values using date strings to avoid timezone issues
    // Parse startStr and endStr as local dates for iteration
    const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endStr.split('-').map(Number);
    
    // Create dates using local timezone (not UTC)
    let currentDate = new Date(startYear, startMonth - 1, startDay);
    const endDateLocal = new Date(endYear, endMonth - 1, endDay);
    
    if (useWeeklyGrouping) {
      // Initialize weeks
      while (currentDate <= endDateLocal) {
        const weekKey = getWeekKey(currentDate);
        if (!revenueByPeriod[weekKey]) {
          revenueByPeriod[weekKey] = { 
            revenue: 0, 
            deposits: 0, 
            bookings: 0, 
            orders: 0,
            byPaymentMethod: {}
          };
        }
        currentDate.setDate(currentDate.getDate() + 7);
      }
    } else {
      // Initialize days
      while (currentDate <= endDateLocal) {
        // Format as YYYY-MM-DD manually to avoid timezone issues
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        revenueByPeriod[dateStr] = { 
          revenue: 0, 
          deposits: 0, 
          bookings: 0, 
          orders: 0,
          byPaymentMethod: {}
        };
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // Add bookings data
    currentBookings.forEach(b => {
      const key = useWeeklyGrouping ? getWeekKey(b.date) : b.date;
      if (revenueByPeriod[key]) {
        const amount = parseFloat(b.totalAmount || 0);
        revenueByPeriod[key].revenue += amount;
        revenueByPeriod[key].deposits += parseFloat(b.depositAmount || 0);
        revenueByPeriod[key].bookings += 1;
        
        // Track by payment method
        const method = b.depositMethod || 'sin_especificar';
        const methodLabel = getMethodName(method);
        if (!revenueByPeriod[key].byPaymentMethod[methodLabel]) {
          revenueByPeriod[key].byPaymentMethod[methodLabel] = 0;
        }
        revenueByPeriod[key].byPaymentMethod[methodLabel] += amount;
      }
    });
    
    // Add orders to revenue
    currentOrders.forEach(o => {
      const orderDate = o.createdAt.toISOString().split('T')[0];
      const key = useWeeklyGrouping ? getWeekKey(orderDate) : orderDate;
      if (revenueByPeriod[key]) {
        const amount = parseFloat(o.total || 0);
        revenueByPeriod[key].revenue += amount;
        revenueByPeriod[key].orders += 1;
        
        // Track by payment method
        const method = o.paymentMethod || 'sin_especificar';
        const methodLabel = getMethodName(method);
        if (!revenueByPeriod[key].byPaymentMethod[methodLabel]) {
          revenueByPeriod[key].byPaymentMethod[methodLabel] = 0;
        }
        revenueByPeriod[key].byPaymentMethod[methodLabel] += amount;
      }
    });

    const dailyRevenue = Object.entries(revenueByPeriod)
      .map(([date, data]) => ({ date, ...data, isWeekly: useWeeklyGrouping }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by type (bookings by bookingType, orders by orderType)
    const revenueByType = {};
    
    // Add bookings by their type
    currentBookings.forEach(b => {
      const type = b.bookingType || 'normal';
      if (!revenueByType[type]) {
        revenueByType[type] = { count: 0, amount: 0 };
      }
      revenueByType[type].count += 1;
      revenueByType[type].amount += parseFloat(b.totalAmount || 0);
    });
    
    // Add orders separated by orderType
    for (const o of currentOrders) {
      if (o.orderType === 'booking_consumption') {
        // Consumo en reserva - add full order total (booking + consumptions)
        if (!revenueByType['consumo_en_reserva']) {
          revenueByType['consumo_en_reserva'] = { count: 0, amount: 0 };
        }
        revenueByType['consumo_en_reserva'].count += 1;
        revenueByType['consumo_en_reserva'].amount += parseFloat(o.total || 0);
      } else {
        // Venta directa
        if (!revenueByType['venta_directa']) {
          revenueByType['venta_directa'] = { count: 0, amount: 0 };
        }
        revenueByType['venta_directa'].count += 1;
        revenueByType['venta_directa'].amount += parseFloat(o.total || 0);
      }
    }

    // All transactions (only orders - same as /ventas page)
    const allTransactions = await Promise.all(currentOrders.map(async (o) => {
      // Format date manually to avoid timezone issues
      const createdDate = new Date(o.createdAt);
      const dateStr = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}:${String(createdDate.getSeconds()).padStart(2, '0')}`;
      
      const isConsumption = o.orderType === 'booking_consumption';
      
      // Get order items count
      const orderItems = await OrderItem.findAll({ where: { orderId: o.id }, raw: true });
      const itemsCount = orderItems.length;
      
      // Get created by user
      let createdByUser = 'Sistema';
      if (o.createdByUserId) {
        const user = await EstablishmentUser.findByPk(o.createdByUserId, { attributes: ['name'], raw: true });
        if (user) createdByUser = user.name;
      }
      
      // Get invoice/billing status
      const invoice = await Invoice.findOne({ where: { orderId: o.id }, raw: true });
      let billingStatus = 'not_invoiced';
      if (invoice) {
        if (invoice.status === 'emitido' && !invoice.anuladoPorId) {
          billingStatus = 'invoiced';
        } else if (invoice.anuladoPorId) {
          billingStatus = 'credit_note';
        }
      }
      
      // Calculate paidAmount based on order type (same logic as /ventas)
      let paidAmount = 0;
      let bookingDate = null;
      let bookingTime = null;
      
      if (isConsumption && o.bookingId) {
        // For booking_consumption, paid = seña + booking payments
        const fullBooking = await Booking.findByPk(o.bookingId, { raw: true });
        const depositAmount = parseFloat(fullBooking?.depositAmount) || 0;
        const initialDeposit = parseFloat(fullBooking?.initialDeposit) || 0;
        
        const bpList = await BookingPayment.findAll({ where: { bookingId: o.bookingId }, raw: true });
        const depositPmts = bpList.filter(p => p.paymentType === 'deposit');
        const declaredPmts = bpList.filter(p => p.paymentType !== 'deposit');
        const seña = depositPmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || initialDeposit;
        const declaredTotal = declaredPmts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        paidAmount = seña + declaredTotal;
        
        bookingDate = fullBooking?.date;
        bookingTime = fullBooking?.startTime || fullBooking?.time;
      } else {
        // Direct sale - use paidAmount from order
        paidAmount = parseFloat(o.paidAmount) || 0;
      }
      
      return {
        id: o.id,
        type: 'order',
        category: isConsumption ? 'Consumo en reserva' : 'Venta directa',
        description: isConsumption ? `Consumo - ${o.customerName}` : `Venta - ${o.customerName}`,
        amount: o.total,
        paidAmount: paidAmount,
        depositAmount: 0,
        date: dateStr,
        time: timeStr,
        status: o.status === 'completed' ? 'completed' : o.paymentStatus === 'paid' ? 'completed' : 'pending',
        paymentStatus: o.paymentStatus || 'pending',
        paymentMethod: getPaymentMethodLabel(o.paymentMethod || 'sin_especificar'),
        reference: o.orderNumber,
        clientName: o.customerName,
        clientPhone: o.customerPhone,
        court: isConsumption ? 'Consumo' : 'Venta Directa',
        itemsCount: itemsCount,
        createdByUser: createdByUser,
        billingStatus: billingStatus,
        bookingDate: bookingDate,
        bookingTime: bookingTime,
        sortDate: createdDate
      };
    }));
    
    // Sort by date descending and remove sortDate
    const sortedTransactions = allTransactions
      .sort((a, b) => b.sortDate - a.sortDate)
      .map(({ sortDate, ...tx }) => tx);

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
        totalSales: currentBookings.length + currentOrders.length,
        totalPaid,
        totalPending,
        averageTicket: (currentBookings.length + currentOrders.length) > 0 ? totalRevenue / (currentBookings.length + currentOrders.length) : 0,
        growth: {
          revenue: Math.round(revenueGrowth * 10) / 10,
          trend: revenueGrowth > 0 ? 'up' : revenueGrowth < 0 ? 'down' : 'stable'
        }
      },
      breakdown: {
        byPaymentMethod: (() => {
          // Group by resolved name to avoid duplicates (e.g., "cash" and "efectivo" both -> "Efectivo")
          const groupedByName = {};
          Object.entries(paymentMethods).forEach(([code, data]) => {
            const name = getMethodName(code);
            if (!groupedByName[name]) {
              groupedByName[name] = { count: 0, amount: 0 };
            }
            groupedByName[name].count += data.count;
            groupedByName[name].amount += data.amount;
          });
          return Object.entries(groupedByName).map(([method, data]) => ({
            method,
            ...data,
            percentage: totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0
          }));
        })(),
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
      transactions: sortedTransactions
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
    'cash': 'Efectivo',
    'transferencia': 'Transferencia',
    'transfer': 'Transferencia',
    'tarjeta': 'Tarjeta',
    'card': 'Tarjeta',
    'mercadopago': 'MercadoPago',
    'pending': 'Pendiente de Cobro',
    'pendiente': 'Pendiente de Cobro',
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
    'abonado': 'Abonado',
    'venta_directa': 'Venta Directa',
    'consumo_en_reserva': 'Consumo en Reserva'
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
    const { period = 'month', startDate, endDate } = req.query;

    // Calculate date range based on period or custom dates
    const now = new Date();
    let start, end;
    
    if (period === 'custom' && startDate) {
      // Use local date parsing to avoid timezone issues
      const todayStr = now.toISOString().split('T')[0];
      const effectiveEndDate = endDate || todayStr;
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = effectiveEndDate.split('-').map(Number);
      start = new Date(sy, sm - 1, sd);
      end = new Date(ey, em - 1, ed);
    } else {
      end = now;
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
    }

    const { Order, OrderItem, OrderPayment, Product, PaymentMethod } = require('../models');

    // Get all direct sale orders in the period (for OrderItems)
    const orders = await Order.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.between]: [start, end] },
        status: { [Op.in]: ['completed', 'pending'] },
        orderType: 'direct_sale'
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

    // Get all booking consumptions in the period
    const bookingConsumptions = await BookingConsumption.findAll({
      where: {
        establishmentId,
        createdAt: { [Op.between]: [start, end] }
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name']
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'depositMethod']
        }
      ]
    });

    // Get payment methods for the establishment
    const paymentMethods = await PaymentMethod.findAll({
      where: { establishmentId, isActive: true },
      order: [['sortOrder', 'ASC']]
    });

    // Helper to normalize payment method codes to match establishment PaymentMethod codes
    const normalizePaymentMethod = (method) => {
      const methodMap = {
        'cash': 'efectivo',
        'transfer': 'transferencia',
        'card': 'credito',
        'mercadopago': 'transferencia',
        'efectivo': 'efectivo',
        'transferencia': 'transferencia',
        'credito': 'credito',
        'debito': 'debito'
      };
      return methodMap[method?.toLowerCase()] || method || 'efectivo';
    };

    // Create a map to store sales by product and payment method
    const salesByProduct = {};

    // Process direct sale order items
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
            const method = normalizePaymentMethod(payment.paymentMethod);
            const paymentAmount = parseFloat(payment.amount || 0);
            const itemPaymentAmount = paymentAmount * itemProportion;

            if (!salesByProduct[productId].byPaymentMethod[method]) {
              salesByProduct[productId].byPaymentMethod[method] = 0;
            }
            salesByProduct[productId].byPaymentMethod[method] += itemPaymentAmount;
          });
        } else {
          // If no payments, use the order's paymentMethod
          const method = normalizePaymentMethod(order.paymentMethod || 'cash');
          if (!salesByProduct[productId].byPaymentMethod[method]) {
            salesByProduct[productId].byPaymentMethod[method] = 0;
          }
          salesByProduct[productId].byPaymentMethod[method] += itemTotal;
        }
      });
    });

    // Process booking consumptions
    bookingConsumptions.forEach(consumption => {
      const productId = consumption.productId;
      const productName = consumption.product?.name || consumption.productName || 'Producto';
      
      if (!salesByProduct[productId]) {
        salesByProduct[productId] = {
          productId,
          productName,
          totalQuantity: 0,
          totalAmount: 0,
          byPaymentMethod: {}
        };
      }

      const itemTotal = parseFloat(consumption.totalPrice || 0);
      salesByProduct[productId].totalQuantity += consumption.quantity || 1;
      salesByProduct[productId].totalAmount += itemTotal;

      // For booking consumptions, normalize payment method to match PaymentMethod codes
      const rawMethod = consumption.booking?.depositMethod || 'cash';
      const method = normalizePaymentMethod(rawMethod);
      if (!salesByProduct[productId].byPaymentMethod[method]) {
        salesByProduct[productId].byPaymentMethod[method] = 0;
      }
      salesByProduct[productId].byPaymentMethod[method] += itemTotal;
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
