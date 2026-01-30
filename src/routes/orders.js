const express = require('express');
const router = express.Router();
const { Order, OrderItem, OrderPayment, Product, Establishment, Booking, Client, User, StockMovement, BookingConsumption, CurrentAccount, CurrentAccountMovement, Invoice, BookingPayment } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getUserActiveCashRegister, registerSaleMovement } = require('../utils/cashRegisterHelper');

// Generate order number
const generateOrderNumber = async (establishmentId) => {
  const today = new Date();
  const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  
  // Count orders for this establishment today
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  
  const count = await Order.count({
    where: {
      establishmentId,
      createdAt: {
        [Op.between]: [startOfDay, endOfDay]
      }
    }
  });
  
  return `ORD-${datePrefix}-${String(count + 1).padStart(4, '0')}`;
};

// Get all orders for establishment (with filters)
router.get('/establishment/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      status, 
      paymentStatus, 
      orderType,
      startDate, 
      endDate,
      search,
      page = 1, 
      limit = 20 
    } = req.query;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build where clause
    const where = { establishmentId };
    
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (orderType) where.orderType = orderType;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate + 'T00:00:00';
      if (endDate) where.createdAt[Op.lte] = endDate + 'T23:59:59';
    }

    if (search) {
      where[Op.or] = [
        { orderNumber: { [Op.iLike]: `%${search}%` } },
        { customerName: { [Op.iLike]: `%${search}%` } },
        { customerPhone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // First get orders without complex includes to avoid association errors
    const { count, rows: ordersRaw } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
      raw: true
    });

    // Enrich orders with related data
    const orders = await Promise.all(ordersRaw.map(async (order) => {
      // Get client if exists
      let client = null;
      if (order.clientId) {
        client = await Client.findByPk(order.clientId, {
          attributes: ['id', 'name', 'phone', 'email'],
          raw: true
        });
      }

      // Get booking if exists
      let booking = null;
      if (order.bookingId) {
        booking = await Booking.findByPk(order.bookingId, {
          attributes: ['id', 'date', 'startTime', 'endTime'],
          raw: true
        });
      }

      // Get created by user
      let createdByUser = null;
      if (order.createdBy) {
        createdByUser = await User.findByPk(order.createdBy, {
          attributes: ['id', 'firstName', 'lastName'],
          raw: true
        });
        if (createdByUser) {
          createdByUser.name = `${createdByUser.firstName} ${createdByUser.lastName}`;
        }
      }

      // Get order items
      const items = await OrderItem.findAll({
        where: { orderId: order.id },
        raw: true
      });

      // Get product info for each item
      const itemsWithProducts = await Promise.all(items.map(async (item) => {
        const product = await Product.findByPk(item.productId, {
          attributes: ['id', 'name', 'image'],
          raw: true
        });
        return { ...item, product };
      }));

      // For booking_consumption orders, also get booking consumptions if no order items
      let finalItems = itemsWithProducts;
      let calculatedTotal = order.total;
      let calculatedStatus = order.status;
      let calculatedPaymentStatus = order.paymentStatus;
      
      if (order.orderType === 'booking_consumption' && order.bookingId) {
        // Get full booking data for status sync
        const fullBooking = await Booking.findByPk(order.bookingId, {
          attributes: ['id', 'status', 'totalAmount', 'depositAmount', 'initialDeposit'],
          raw: true
        });
        
        const consumptions = await BookingConsumption.findAll({
          where: { bookingId: order.bookingId },
          raw: true
        });
        
        // Calculate consumptions total
        let consumptionsTotal = 0;
        if (consumptions.length > 0) {
          const consumptionItems = await Promise.all(consumptions.map(async (c) => {
            const product = await Product.findByPk(c.productId, {
              attributes: ['id', 'name', 'image'],
              raw: true
            });
            return {
              id: c.id,
              productId: c.productId,
              productName: product?.name || 'Producto',
              quantity: c.quantity,
              unitPrice: parseFloat(c.unitPrice) || 0,
              totalPrice: parseFloat(c.totalPrice) || 0,
              product
            };
          }));
          
          // Use consumptions as items if no order items exist
          if (finalItems.length === 0) {
            finalItems = consumptionItems;
          }
          
          consumptionsTotal = consumptionItems.reduce((sum, item) => sum + item.totalPrice, 0);
        }
        
        // Calculate total from booking + consumptions
        const bookingTotal = parseFloat(fullBooking?.totalAmount) || 0;
        const depositAmount = parseFloat(fullBooking?.depositAmount) || 0;
        calculatedTotal = bookingTotal + consumptionsTotal;
        
        // Sync status with booking
        if (fullBooking) {
          calculatedStatus = fullBooking.status === 'completed' ? 'completed' : 
                            fullBooking.status === 'cancelled' ? 'cancelled' : 'pending';
          
          // Calculate payment status based on pending amount
          const pendingAmount = Math.max(0, calculatedTotal - depositAmount);
          if (pendingAmount <= 0) {
            calculatedPaymentStatus = 'paid';
          } else if (depositAmount > 0) {
            calculatedPaymentStatus = 'partial';
          } else {
            calculatedPaymentStatus = 'pending';
          }
        }
      }

      // Get billing status - check if order has invoiceId
      let billingStatus = null;
      const orderInvoiceId = order.invoiceId || order.invoice_id;
      if (orderInvoiceId) {
        try {
          // Get invoice and any credit notes referencing it
          const invoice = await Invoice.findByPk(orderInvoiceId, {
            attributes: ['id', 'tipoComprobante', 'status']
          });
          
          if (invoice) {
            // Check if there are credit notes for this invoice
            const creditNotes = await Invoice.findAll({
              where: { comprobanteAsociadoId: orderInvoiceId },
              attributes: ['id', 'tipoComprobante'],
              order: [['created_at', 'DESC']],
              limit: 1
            });
            
            if (creditNotes.length > 0) {
              billingStatus = 'credit_note';
            } else {
              billingStatus = 'invoiced';
            }
          }
        } catch (invErr) {
          console.error('Error fetching invoice for order:', order.id, invErr.message);
        }
      }

      return {
        ...order,
        client,
        booking,
        createdByUser,
        items: finalItems,
        total: calculatedTotal,
        status: calculatedStatus,
        paymentStatus: calculatedPaymentStatus,
        billingStatus
      };
    }));

    res.json({
      orders,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get order by booking ID
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const order = await Order.findOne({
      where: { bookingId },
      attributes: ['id', 'orderNumber'],
      raw: true
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found for this booking' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Error fetching order by booking:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Export orders to CSV - MUST be before /:id route
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, orderType, paymentStatus, paymentMethod } = req.query;

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

    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [startDate + 'T00:00:00', endDate + 'T23:59:59'] };
    } else if (startDate) {
      where.createdAt = { [Op.gte]: startDate + 'T00:00:00' };
    } else if (endDate) {
      where.createdAt = { [Op.lte]: endDate + 'T23:59:59' };
    }

    if (orderType) {
      where.orderType = orderType;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    const orders = await Order.findAll({
      where,
      include: [
        { model: OrderItem, as: 'items' },
        { model: Client, as: 'client', attributes: ['name', 'phone'] },
        { model: User, as: 'createdByUser', attributes: ['firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(orders);

    const csvData = orders.map(order => {
      const items = order.items || [];
      const productsList = items.map(i => `${i.productName} (x${i.quantity})`).join(', ');
      
      return {
        fechaHora: csvUtils.formatDateTimeForCSV(order.createdAt),
        numeroOrden: order.orderNumber,
        tipo: order.orderType === 'direct_sale' ? 'Venta Directa' : 'Consumo Reserva',
        cliente: order.customerName || order.client?.name || '-',
        productos: productsList || '-',
        subtotal: csvUtils.formatNumberForCSV(order.subtotal),
        descuento: csvUtils.formatNumberForCSV(order.discount),
        total: csvUtils.formatNumberForCSV(order.total),
        pagado: csvUtils.formatNumberForCSV(order.paidAmount),
        pendiente: csvUtils.formatNumberForCSV((order.total || 0) - (order.paidAmount || 0)),
        metodoPago: order.paymentMethod || '-',
        estadoPago: order.paymentStatus === 'paid' ? 'Pagado' : order.paymentStatus === 'partial' ? 'Parcial' : 'Pendiente',
        usuario: order.createdByUser ? `${order.createdByUser.firstName} ${order.createdByUser.lastName}`.trim() : 'N/A',
        notas: order.notes || ''
      };
    });

    const fields = [
      { label: 'Fecha/Hora', value: 'fechaHora' },
      { label: 'Nº Orden', value: 'numeroOrden' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Cliente', value: 'cliente' },
      { label: 'Productos', value: 'productos' },
      { label: 'Subtotal', value: 'subtotal' },
      { label: 'Descuento', value: 'descuento' },
      { label: 'Total', value: 'total' },
      { label: 'Pagado', value: 'pagado' },
      { label: 'Pendiente', value: 'pendiente' },
      { label: 'Método de Pago', value: 'metodoPago' },
      { label: 'Estado de Pago', value: 'estadoPago' },
      { label: 'Usuario', value: 'usuario' },
      { label: 'Notas', value: 'notas' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ventas_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({ error: 'Failed to export orders', message: error.message });
  }
});

// Get single order with full details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const orderRaw = await Order.findByPk(id, { raw: true });

    if (!orderRaw) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(orderRaw.establishmentId, {
      attributes: ['id', 'name', 'slug', 'userId'],
      raw: true
    });
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get client if exists
    let client = null;
    if (orderRaw.clientId) {
      client = await Client.findByPk(orderRaw.clientId, {
        attributes: ['id', 'name', 'phone', 'email'],
        raw: true
      });
    }

    // Get booking if exists with all related data
    let booking = null;
    let bookingPayments = [];
    let bookingConsumptions = [];
    if (orderRaw.bookingId) {
      booking = await Booking.findByPk(orderRaw.bookingId, {
        attributes: ['id', 'date', 'startTime', 'endTime', 'courtId', 'totalAmount', 'depositAmount', 'initialDeposit', 'clientName', 'clientPhone'],
        raw: true
      });
      if (booking && booking.courtId) {
        const Court = require('../models').Court;
        const court = await Court.findByPk(booking.courtId, {
          attributes: ['id', 'name'],
          raw: true
        });
        booking.court = court;
      }
      
      // Get booking payments (pagos declarados)
      const BookingPayment = require('../models').BookingPayment;
      if (BookingPayment) {
        bookingPayments = await BookingPayment.findAll({
          where: { bookingId: orderRaw.bookingId },
          order: [['createdAt', 'DESC']],
          raw: true
        });
      }
      
      // Get booking consumptions
      const consumptions = await BookingConsumption.findAll({
        where: { bookingId: orderRaw.bookingId },
        raw: true
      });
      
      // Get product info for consumptions
      bookingConsumptions = await Promise.all(consumptions.map(async (c) => {
        const product = await Product.findByPk(c.productId, {
          attributes: ['id', 'name', 'image'],
          raw: true
        });
        return { ...c, product };
      }));
    }

    // Get created by user
    let createdByUser = null;
    if (orderRaw.createdBy) {
      createdByUser = await User.findByPk(orderRaw.createdBy, {
        attributes: ['id', 'firstName', 'lastName'],
        raw: true
      });
      if (createdByUser) {
        createdByUser.name = `${createdByUser.firstName} ${createdByUser.lastName}`;
      }
    }

    // Get order items
    const items = await OrderItem.findAll({
      where: { orderId: id },
      raw: true
    });

    // Get product info for each item
    const itemsWithProducts = await Promise.all(items.map(async (item) => {
      const product = await Product.findByPk(item.productId, {
        attributes: ['id', 'name', 'image', 'unit'],
        raw: true
      });
      return { ...item, product };
    }));

    // Get payments
    const paymentsRaw = await OrderPayment.findAll({
      where: { orderId: id },
      raw: true
    });

    const payments = await Promise.all(paymentsRaw.map(async (payment) => {
      let registeredByUser = null;
      if (payment.registeredBy) {
        registeredByUser = await User.findByPk(payment.registeredBy, {
          attributes: ['id', 'firstName', 'lastName'],
          raw: true
        });
        if (registeredByUser) {
          registeredByUser.name = `${registeredByUser.firstName} ${registeredByUser.lastName}`;
        }
      }
      return { ...payment, registeredByUser };
    }));

    // Calculate status and payment status for booking_consumption orders
    let calculatedStatus = orderRaw.status;
    let calculatedPaymentStatus = orderRaw.paymentStatus;
    let calculatedTotal = parseFloat(orderRaw.total) || 0;
    
    if (orderRaw.orderType === 'booking_consumption' && booking) {
      // Calculate total from booking + consumptions
      const bookingTotal = parseFloat(booking.totalAmount) || 0;
      const consumptionsTotal = bookingConsumptions.reduce((sum, c) => sum + (parseFloat(c.totalPrice) || 0), 0);
      calculatedTotal = bookingTotal + consumptionsTotal;
      
      // Get deposit amount (includes both initial deposit and declared payments)
      const depositAmount = parseFloat(booking.depositAmount) || 0;
      
      // Calculate pending amount
      const pendingAmount = Math.max(0, calculatedTotal - depositAmount);
      
      // Sync status with booking
      const fullBooking = await Booking.findByPk(orderRaw.bookingId, {
        attributes: ['status'],
        raw: true
      });
      
      if (fullBooking) {
        calculatedStatus = fullBooking.status === 'completed' ? 'completed' : 
                          fullBooking.status === 'cancelled' ? 'cancelled' : 'pending';
      }
      
      // Calculate payment status based on pending amount
      if (pendingAmount <= 0) {
        calculatedPaymentStatus = 'paid';
      } else if (depositAmount > 0) {
        calculatedPaymentStatus = 'partial';
      } else {
        calculatedPaymentStatus = 'pending';
      }
    }

    // Get invoice history using order.invoiceId
    let invoiceHistory = [];
    let invoice = null;
    let billingStatus = null;
    
    try {
      const orderInvoiceId = orderRaw.invoiceId || orderRaw.invoice_id;
      if (orderInvoiceId) {
        // Get the main invoice
        const mainInvoice = await Invoice.findByPk(orderInvoiceId, {
          attributes: [
            'id', 'tipoComprobante', 'tipoComprobanteNombre', 'puntoVenta', 
            'numeroComprobante', 'cae', 'caeVencimiento', 'fechaEmision',
            'importeTotal', 'status', 'comprobanteAsociadoId', 'motivoNc', 'created_at'
          ]
        });
        
        if (mainInvoice) {
          const mainInvoiceData = {
            id: mainInvoice.id,
            tipoComprobante: mainInvoice.tipoComprobante,
            tipoComprobanteNombre: mainInvoice.tipoComprobanteNombre,
            puntoVenta: mainInvoice.puntoVenta,
            numeroComprobante: mainInvoice.numeroComprobante,
            cae: mainInvoice.cae,
            caeVencimiento: mainInvoice.caeVencimiento,
            fechaEmision: mainInvoice.fechaEmision,
            importeTotal: mainInvoice.importeTotal,
            status: mainInvoice.status,
            createdAt: mainInvoice.created_at,
            isNotaCredito: false
          };
          
          invoiceHistory.push(mainInvoiceData);
          invoice = mainInvoiceData;
          billingStatus = 'invoiced';
          
          // Get any credit notes referencing this invoice
          const creditNotes = await Invoice.findAll({
            where: { comprobanteAsociadoId: orderInvoiceId },
            attributes: [
              'id', 'tipoComprobante', 'tipoComprobanteNombre', 'puntoVenta', 
              'numeroComprobante', 'cae', 'caeVencimiento', 'fechaEmision',
              'importeTotal', 'status', 'motivoNc'
            ],
            order: [['created_at', 'ASC']]
          });
          
          for (const nc of creditNotes) {
            invoiceHistory.push({
              id: nc.id,
              tipoComprobante: nc.tipoComprobante,
              tipoComprobanteNombre: nc.tipoComprobanteNombre,
              puntoVenta: nc.puntoVenta,
              numeroComprobante: nc.numeroComprobante,
              cae: nc.cae,
              caeVencimiento: nc.caeVencimiento,
              fechaEmision: nc.fechaEmision,
              importeTotal: nc.importeTotal,
              status: nc.status,
              motivoNc: nc.motivoNc,
              isNotaCredito: true
            });
          }
          
          // Update billing status if last item is a credit note
          if (invoiceHistory.length > 0) {
            const lastItem = invoiceHistory[invoiceHistory.length - 1];
            billingStatus = lastItem.isNotaCredito ? 'credit_note' : 'invoiced';
          }
        }
      }
    } catch (invoiceError) {
      console.error('Error fetching invoice history for order', id, ':', invoiceError);
    }

    const order = {
      ...orderRaw,
      establishment: { id: establishment.id, name: establishment.name, slug: establishment.slug },
      client,
      booking,
      bookingPayments,
      bookingConsumptions,
      createdByUser,
      items: itemsWithProducts,
      payments,
      invoice,
      invoiceHistory,
      billingStatus,
      status: calculatedStatus,
      paymentStatus: calculatedPaymentStatus,
      total: calculatedTotal
    };

    res.json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create new order (direct sale)
router.post('/', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      establishmentId, 
      clientId,
      customerName,
      customerPhone,
      customerEmail,
      currentAccountId,
      items, // Array of { productId, quantity, notes, unitPrice }
      paymentMethod,
      paidAmount,
      discount = 0,
      notes
    } = req.body;

    if (!establishmentId || !items || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Establishment not found' });
    }
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if user has an open cash register
    const cashRegister = await getUserActiveCashRegister(req.user.id, establishmentId);
    if (!cashRegister) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debes abrir una caja antes de completar pedidos' });
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(establishmentId);

    // Calculate totals and validate products
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.productId, { transaction });
      
      if (!product || product.establishmentId !== establishmentId) {
        await transaction.rollback();
        return res.status(400).json({ error: `Product ${item.productId} not found or doesn't belong to establishment` });
      }

      if (!product.isActive) {
        await transaction.rollback();
        return res.status(400).json({ error: `Product ${product.name} is not active` });
      }

      // Stock can go negative - no validation needed
      // This allows sales even when stock entry hasn't been recorded yet

      // Use custom unitPrice if provided (for current account sales with cost price)
      // Otherwise use the product's sale price
      const unitPrice = item.unitPrice !== undefined ? parseFloat(item.unitPrice) : parseFloat(product.salePrice);
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        notes: item.notes || null
      });

      // Update stock
      if (product.trackStock) {
        const previousStock = product.currentStock;
        await product.update({ currentStock: previousStock - item.quantity }, { transaction });

        // Create stock movement
        await StockMovement.create({
          establishmentId,
          productId: product.id,
          type: 'venta',
          quantity: -item.quantity,
          previousStock,
          newStock: previousStock - item.quantity,
          unitCost: product.costPrice,
          totalCost: product.costPrice * item.quantity,
          notes: `Venta directa - Pedido ${orderNumber}`,
          userId: req.user.id
        }, { transaction });
      }
    }

    const total = subtotal - parseFloat(discount);
    const paid = parseFloat(paidAmount) || 0;

    // Determine payment status
    let paymentStatus = 'pending';
    if (paid >= total) {
      paymentStatus = 'paid';
    } else if (paid > 0) {
      paymentStatus = 'partial';
    }

    // Create order
    const order = await Order.create({
      orderNumber,
      establishmentId,
      clientId: clientId || null,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerEmail: customerEmail || null,
      orderType: 'direct_sale',
      status: 'completed',
      paymentStatus,
      paymentMethod: paymentMethod || 'pending',
      subtotal,
      discount,
      total,
      paidAmount: paid,
      notes: notes || null,
      createdBy: req.user.id
    }, { transaction });

    // Create order items
    for (const item of orderItems) {
      await OrderItem.create({
        orderId: order.id,
        ...item
      }, { transaction });
    }

    // Create payment record if paid
    if (paid > 0 && paymentMethod && paymentMethod !== 'pending') {
      await OrderPayment.create({
        orderId: order.id,
        amount: paid,
        paymentMethod,
        registeredBy: req.user.id
      }, { transaction });

      // Register cash register movement
      await registerSaleMovement({
        cashRegisterId: cashRegister.id,
        establishmentId,
        orderId: order.id,
        amount: paid,
        paymentMethod,
        description: `Venta directa - Pedido #${orderNumber}`,
        registeredBy: req.user.id
      }, transaction);
    }

    // Create current account movement if this is a current account sale
    if (currentAccountId) {
      console.log(`[DirectSale] Creating movement for current account ${currentAccountId}, total: ${total}`);
      const currentAccount = await CurrentAccount.findByPk(currentAccountId, { transaction });
      
      if (currentAccount) {
        const newBalance = parseFloat(currentAccount.currentBalance) + total;
        console.log(`[DirectSale] Current balance: ${currentAccount.currentBalance}, new balance: ${newBalance}`);
        
        // Create movement record
        const movement = await CurrentAccountMovement.create({
          currentAccountId,
          establishmentId,
          movementType: 'purchase',
          amount: total,
          balanceAfter: newBalance,
          orderId: order.id,
          description: `Compra - Pedido #${orderNumber}`,
          registeredBy: req.user.id
        }, { transaction });
        console.log(`[DirectSale] Created movement ${movement.id}`);

        // Update account balance and totals
        await currentAccount.update({
          currentBalance: newBalance,
          totalPurchases: parseFloat(currentAccount.totalPurchases) + total
        }, { transaction });
        console.log(`[DirectSale] Updated account balance`);
      } else {
        console.log(`[DirectSale] Current account ${currentAccountId} not found`);
      }
    } else {
      console.log(`[DirectSale] No currentAccountId provided`);
    }

    await transaction.commit();

    // Fetch complete order
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'phone', 'email'] },
        { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'image'] }] },
        { model: OrderPayment, as: 'payments' }
      ]
    });

    res.status(201).json({ order: completeOrder });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Create order from booking consumptions
router.post('/from-booking/:bookingId', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { bookingId } = req.params;
    const { paymentMethod, paidAmount } = req.body;

    // Get booking with consumptions
    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: Establishment, as: 'establishment' },
        { model: Client, as: 'client' }
      ]
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify access
    if (booking.establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if user has an open cash register
    const cashRegister = await getUserActiveCashRegister(req.user.id, booking.establishmentId);
    if (!cashRegister) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debes abrir una caja antes de completar pedidos' });
    }

    // Get consumptions not yet linked to an order
    const consumptions = await BookingConsumption.findAll({
      where: { 
        bookingId,
        orderId: null
      },
      include: [{ model: Product, as: 'product' }],
      transaction
    });

    if (consumptions.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No consumptions to convert to order' });
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(booking.establishmentId);

    // Calculate totals
    const subtotal = consumptions.reduce((sum, c) => sum + parseFloat(c.totalPrice), 0);
    const total = subtotal;
    const paid = parseFloat(paidAmount) || 0;

    // Determine payment status
    let paymentStatus = 'pending';
    if (paid >= total) {
      paymentStatus = 'paid';
    } else if (paid > 0) {
      paymentStatus = 'partial';
    }

    // Create order
    const order = await Order.create({
      orderNumber,
      establishmentId: booking.establishmentId,
      bookingId,
      clientId: booking.clientId || null,
      customerName: booking.guestName || null,
      customerPhone: booking.guestPhone || null,
      orderType: 'booking_consumption',
      status: 'completed',
      paymentStatus,
      paymentMethod: paymentMethod || 'pending',
      subtotal,
      discount: 0,
      total,
      paidAmount: paid,
      createdBy: req.user.id
    }, { transaction });

    // Create order items from consumptions
    for (const consumption of consumptions) {
      await OrderItem.create({
        orderId: order.id,
        productId: consumption.productId,
        productName: consumption.product.name,
        quantity: consumption.quantity,
        unitPrice: consumption.unitPrice,
        totalPrice: consumption.totalPrice,
        notes: consumption.notes
      }, { transaction });

      // Link consumption to order
      await consumption.update({ orderId: order.id }, { transaction });
    }

    // Create payment record if paid
    if (paid > 0 && paymentMethod && paymentMethod !== 'pending') {
      await OrderPayment.create({
        orderId: order.id,
        amount: paid,
        paymentMethod,
        registeredBy: req.user.id
      }, { transaction });

      // Register cash register movement
      await registerSaleMovement({
        cashRegisterId: cashRegister.id,
        establishmentId: booking.establishmentId,
        orderId: order.id,
        bookingId: booking.id,
        amount: paid,
        paymentMethod,
        description: `Consumos de reserva - Pedido #${orderNumber}`,
        registeredBy: req.user.id
      }, transaction);
    }

    await transaction.commit();

    // Fetch complete order
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        { model: Booking, as: 'booking', attributes: ['id', 'date', 'time'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'phone', 'email'] },
        { model: OrderItem, as: 'items' },
        { model: OrderPayment, as: 'payments' }
      ]
    });

    res.status(201).json({ order: completeOrder });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating order from booking:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Add payment to order
router.post('/:id/payment', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, reference, notes } = req.body;

    if (!amount || !paymentMethod) {
      return res.status(400).json({ error: 'Amount and payment method are required' });
    }

    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(order.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate pending amount for validation
    let realTotal = parseFloat(order.total) || 0;
    let totalPaidSoFar = parseFloat(order.paidAmount) || 0;
    
    if (order.orderType === 'booking_consumption' && order.bookingId) {
      const booking = await Booking.findByPk(order.bookingId, { raw: true });
      if (booking) {
        const bookingTotal = parseFloat(booking.totalAmount) || 0;
        const BookingConsumption = require('../models').BookingConsumption;
        const consumptions = await BookingConsumption.findAll({ where: { bookingId: order.bookingId }, raw: true });
        realTotal = bookingTotal + consumptions.reduce((sum, c) => sum + (parseFloat(c.totalPrice) || 0), 0);
        
        const depositAmount = parseFloat(booking.depositAmount) || 0;
        const BookingPayment = require('../models').BookingPayment;
        const bpList = await BookingPayment.findAll({ where: { bookingId: order.bookingId }, raw: true });
        const bpTotal = bpList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const seña = Math.max(0, depositAmount - bpTotal);
        
        const opList = await OrderPayment.findAll({ where: { orderId: id }, raw: true });
        const opTotal = opList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        totalPaidSoFar = seña + bpTotal + opTotal;
      }
    }
    
    const pendingAmount = Math.max(0, realTotal - totalPaidSoFar);
    if (parseFloat(amount) > pendingAmount + 0.01) {
      return res.status(400).json({ error: `El monto excede el pendiente ($${pendingAmount.toLocaleString()})` });
    }

    // Create payment
    const payment = await OrderPayment.create({
      orderId: id,
      amount: parseFloat(amount),
      paymentMethod,
      reference: reference || null,
      notes: notes || null,
      registeredBy: req.user.id
    });

    // Update order paid amount and status
    const newPaidAmount = totalPaidSoFar + parseFloat(amount);
    const newPending = Math.max(0, realTotal - newPaidAmount);
    let paymentStatus = newPending <= 0 ? 'paid' : 'partial';

    // Determine payment method for order
    const payments = await OrderPayment.findAll({ where: { orderId: id } });
    const methods = [...new Set(payments.map(p => p.paymentMethod))];
    const orderPaymentMethod = methods.length > 1 ? 'mixed' : methods[0];

    await order.update({
      paidAmount: newPaidAmount,
      paymentStatus,
      paymentMethod: orderPaymentMethod
    });

    res.json({ 
      payment,
      order: {
        paidAmount: newPaidAmount,
        paymentStatus,
        paymentMethod: orderPaymentMethod
      }
    });
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

// Update order status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'completed', 'cancelled', 'refunded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(order.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await order.update({ status });

    res.json({ order });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Get order statistics for establishment
router.get('/stats/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { startDate, endDate, status, paymentStatus, orderType } = req.query;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate + 'T00:00:00';
      if (endDate) where.createdAt[Op.lte] = endDate + 'T23:59:59';
    }
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (orderType) where.orderType = orderType;

    // Get totals
    const totalOrders = await Order.count({ where });
    const completedOrders = await Order.count({ where: { ...where, status: 'completed' } });
    const paidOrders = await Order.count({ where: { ...where, paymentStatus: 'paid' } });
    
    // Sum directly from order fields (matches table columns)
    const totalRevenue = await Order.sum('total', { where }) || 0;
    const totalPaid = await Order.sum('paidAmount', { where }) || 0;
    const pendingAmount = Math.max(0, totalRevenue - totalPaid);
    
    const directSales = await Order.count({ where: { ...where, orderType: 'direct_sale' } });
    const bookingConsumptions = await Order.count({ where: { ...where, orderType: 'booking_consumption' } });

    res.json({
      stats: {
        totalOrders,
        completedOrders,
        paidOrders,
        pendingPayment: totalOrders - paidOrders,
        totalRevenue,
        totalPaid,
        pendingAmount,
        directSales,
        bookingConsumptions
      }
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Export sales by product
router.get('/sales-by-product/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, categoryId } = req.query;

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

    const orderWhere = { establishmentId, status: { [Op.ne]: 'cancelled' } };

    if (startDate || endDate) {
      orderWhere.createdAt = {};
      if (startDate) {
        orderWhere.createdAt[Op.gte] = startDate + 'T00:00:00';
      }
      if (endDate) {
        orderWhere.createdAt[Op.lte] = endDate + 'T23:59:59';
      }
    }

    const orders = await Order.findAll({
      where: orderWhere,
      include: [{ model: OrderItem, as: 'items' }],
      attributes: ['id']
    });

    const productSales = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.productId || item.productName;
        if (!productSales[key]) {
          productSales[key] = {
            productName: item.productName,
            productId: item.productId,
            quantity: 0,
            totalRevenue: 0
          };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].totalRevenue += parseFloat(item.totalPrice || 0);
      });
    });

    const sortedProducts = Object.values(productSales).sort((a, b) => b.totalRevenue - a.totalRevenue);

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(sortedProducts);

    const totalRevenue = sortedProducts.reduce((sum, p) => sum + p.totalRevenue, 0);

    const csvData = sortedProducts.map((product, index) => ({
      ranking: index + 1,
      producto: product.productName,
      cantidadVendida: product.quantity,
      ingresoTotal: csvUtils.formatNumberForCSV(product.totalRevenue),
      porcentaje: totalRevenue > 0 ? ((product.totalRevenue / totalRevenue) * 100).toFixed(2) + '%' : '0%',
      promedioUnitario: csvUtils.formatNumberForCSV(product.quantity > 0 ? product.totalRevenue / product.quantity : 0)
    }));

    const fields = [
      { label: 'Ranking', value: 'ranking' },
      { label: 'Producto', value: 'producto' },
      { label: 'Cantidad Vendida', value: 'cantidadVendida' },
      { label: 'Ingreso Total', value: 'ingresoTotal' },
      { label: 'Porcentaje', value: 'porcentaje' },
      { label: 'Promedio Unitario', value: 'promedioUnitario' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ventas_por_producto_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting sales by product:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export sales by payment method to CSV
router.get('/by-payment-method/export', authenticateToken, async (req, res) => {
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

    const where = { 
      establishmentId,
      status: { [Op.in]: ['completed', 'paid'] }
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate + 'T00:00:00';
      if (endDate) where.createdAt[Op.lte] = endDate + 'T23:59:59';
    }

    // Get all orders with their payments
    const orders = await Order.findAll({
      where,
      include: [
        { model: OrderPayment, as: 'payments' }
      ],
      attributes: ['id', 'total', 'paymentMethod', 'createdAt']
    });

    // Aggregate by payment method
    const byPaymentMethod = {};
    orders.forEach(order => {
      if (order.payments && order.payments.length > 0) {
        // Use payments if available
        order.payments.forEach(payment => {
          const method = payment.method || 'Efectivo';
          if (!byPaymentMethod[method]) {
            byPaymentMethod[method] = { count: 0, total: 0 };
          }
          byPaymentMethod[method].count += 1;
          byPaymentMethod[method].total += parseFloat(payment.amount || 0);
        });
      } else {
        // Use order payment method
        const method = order.paymentMethod || 'Efectivo';
        if (!byPaymentMethod[method]) {
          byPaymentMethod[method] = { count: 0, total: 0 };
        }
        byPaymentMethod[method].count += 1;
        byPaymentMethod[method].total += parseFloat(order.total || 0);
      }
    });

    const csvUtils = require('../utils/csvGenerator');

    const totalSales = Object.values(byPaymentMethod).reduce((sum, m) => sum + m.total, 0);
    const totalCount = Object.values(byPaymentMethod).reduce((sum, m) => sum + m.count, 0);

    const sortedMethods = Object.entries(byPaymentMethod)
      .sort((a, b) => b[1].total - a[1].total);

    const methodLabels = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'mercadopago': 'MercadoPago',
      'mp': 'MercadoPago'
    };

    const csvData = sortedMethods.map(([method, data], index) => ({
      ranking: index + 1,
      metodoPago: methodLabels[method.toLowerCase()] || method,
      cantidadVentas: data.count,
      montoTotal: csvUtils.formatNumberForCSV(data.total),
      porcentajeMonto: totalSales > 0 ? ((data.total / totalSales) * 100).toFixed(2) + '%' : '0%',
      porcentajeCantidad: totalCount > 0 ? ((data.count / totalCount) * 100).toFixed(2) + '%' : '0%',
      ticketPromedio: csvUtils.formatNumberForCSV(data.count > 0 ? data.total / data.count : 0)
    }));

    const fields = [
      { label: 'Ranking', value: 'ranking' },
      { label: 'Método de Pago', value: 'metodoPago' },
      { label: 'Cantidad Ventas', value: 'cantidadVentas' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: '% del Monto', value: 'porcentajeMonto' },
      { label: '% Cantidad', value: 'porcentajeCantidad' },
      { label: 'Ticket Promedio', value: 'ticketPromedio' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ventas_por_metodo_pago_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting sales by payment method:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
