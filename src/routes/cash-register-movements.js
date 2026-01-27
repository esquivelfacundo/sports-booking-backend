const express = require('express');
const router = express.Router();
const { CashRegisterMovement, CashRegister, Establishment, User, Order, Booking, ExpenseCategory, Expense } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Get movements for a cash register
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { cashRegisterId, establishmentId, type, paymentMethod, startDate, endDate, page = 1, limit = 100 } = req.query;

    if (!cashRegisterId && !establishmentId) {
      return res.status(400).json({ error: 'cashRegisterId or establishmentId is required' });
    }

    const where = {};

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    if (establishmentId) {
      where.establishmentId = establishmentId;
    }

    if (type) {
      where.type = type;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      where.registeredAt = {};
      if (startDate) {
        where.registeredAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.registeredAt[Op.lte] = new Date(endDate);
      }
    }

    // Verify access if establishmentId is provided
    if (establishmentId) {
      const establishment = await Establishment.findByPk(establishmentId);
      if (!establishment) {
        return res.status(404).json({ error: 'Establishment not found' });
      }
      if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: movements } = await CashRegisterMovement.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'registeredByUser',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Order,
          as: 'order',
          attributes: ['id', 'orderNumber', 'total']
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'clientName', 'date', 'startTime']
        },
        {
          model: ExpenseCategory,
          as: 'expenseCategory',
          attributes: ['id', 'name', 'color']
        }
      ],
      order: [['registeredAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    // Add computed user name
    const movementsWithUserName = movements.map(m => {
      const mJson = m.toJSON();
      if (mJson.registeredByUser) {
        mJson.registeredByUser.name = `${mJson.registeredByUser.firstName} ${mJson.registeredByUser.lastName}`.trim();
      }
      return mJson;
    });

    res.json({
      movements: movementsWithUserName,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching cash register movements:', error);
    res.status(500).json({ error: 'Failed to fetch movements' });
  }
});

// Create expense/withdrawal movement
router.post('/expense', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { cashRegisterId, amount, paymentMethod, expenseCategoryId, description, notes } = req.body;

    if (!cashRegisterId || !amount || !paymentMethod) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cashRegister = await CashRegister.findByPk(cashRegisterId, { transaction });
    if (!cashRegister) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Cash register not found' });
    }

    if (cashRegister.closedAt) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Cash register is closed' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(cashRegister.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied' });
    }

    const expenseAmount = parseFloat(amount);

    console.log('Creating expense movement:', {
      cashRegisterId,
      amount: expenseAmount,
      paymentMethod,
      expenseCategoryId,
      description,
      userId: req.user.id
    });

    // Get expense category name if provided
    let categoryName = 'Otros';
    if (expenseCategoryId) {
      try {
        const expenseCategory = await ExpenseCategory.findByPk(expenseCategoryId, { transaction });
        if (expenseCategory) {
          categoryName = expenseCategory.name;
        }
      } catch (catError) {
        console.error('Error fetching expense category:', catError);
      }
    }

    // Create expense record in Expense table
    try {
      await Expense.create({
        establishmentId: cashRegister.establishmentId,
        cashRegisterId,
        userId: req.user.id,
        category: categoryName,
        description: description || 'Gasto desde caja',
        amount: expenseAmount,
        paymentMethod,
        notes,
        expenseDate: new Date().toISOString().split('T')[0]
      }, { transaction });
      console.log('Expense record created successfully');
    } catch (expenseError) {
      console.error('Error creating expense record:', expenseError.message, expenseError.errors);
      // Continue even if expense creation fails - the movement is more important
    }

    // Create movement (negative amount for expense)
    let movement;
    try {
      movement = await CashRegisterMovement.create({
        cashRegisterId,
        establishmentId: cashRegister.establishmentId,
        type: 'expense',
        amount: -Math.abs(expenseAmount),
        paymentMethod,
        expenseCategoryId,
        description,
        notes,
        registeredBy: req.user.id
      }, { transaction });
      console.log('Cash register movement created successfully');
    } catch (movementError) {
      console.error('Error creating cash register movement:', movementError.message, movementError.errors);
      await transaction.rollback();
      return res.status(500).json({ 
        error: 'Failed to create expense movement',
        details: movementError.message 
      });
    }

    // Update cash register totals
    const updates = {
      totalExpenses: parseFloat(cashRegister.totalExpenses) + expenseAmount,
      totalMovements: cashRegister.totalMovements + 1
    };

    // Update payment method totals (subtract from totals)
    const methodField = getPaymentMethodField(paymentMethod);
    if (methodField) {
      updates[methodField] = Math.max(0, parseFloat(cashRegister[methodField]) - expenseAmount);
    }

    // Update expected cash if payment method is cash
    if (paymentMethod === 'cash') {
      updates.expectedCash = Math.max(0, parseFloat(cashRegister.expectedCash) - expenseAmount);
    }

    await cashRegister.update(updates, { transaction });

    await transaction.commit();

    // Fetch movement with relations
    const movementWithRelations = await CashRegisterMovement.findByPk(movement.id, {
      include: [
        {
          model: User,
          as: 'registeredByUser',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: ExpenseCategory,
          as: 'expenseCategory',
          attributes: ['id', 'name', 'color']
        }
      ]
    });

    const mJson = movementWithRelations.toJSON();
    if (mJson.registeredByUser) {
      mJson.registeredByUser.name = `${mJson.registeredByUser.firstName} ${mJson.registeredByUser.lastName}`.trim();
    }

    res.status(201).json({ movement: mJson });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating expense movement:', error);
    res.status(500).json({ error: 'Failed to create expense movement' });
  }
});

// Get report/summary for cash register
router.get('/report/:cashRegisterId', authenticateToken, async (req, res) => {
  try {
    const { cashRegisterId } = req.params;

    const cashRegister = await CashRegister.findByPk(cashRegisterId);
    if (!cashRegister) {
      return res.status(404).json({ error: 'Cash register not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(cashRegister.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get movements by type
    const movementsByType = await CashRegisterMovement.findAll({
      where: { cashRegisterId },
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['type'],
      raw: true
    });

    // Get movements by payment method
    const movementsByPaymentMethod = await CashRegisterMovement.findAll({
      where: { cashRegisterId },
      attributes: [
        'paymentMethod',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['paymentMethod'],
      raw: true
    });

    // Get expense categories breakdown
    const expensesByCategory = await CashRegisterMovement.findAll({
      where: {
        cashRegisterId,
        type: 'expense',
        expenseCategoryId: { [Op.ne]: null }
      },
      attributes: [
        'expenseCategoryId',
        [sequelize.fn('COUNT', sequelize.col('CashRegisterMovement.id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      include: [
        {
          model: ExpenseCategory,
          as: 'expenseCategory',
          attributes: ['id', 'name', 'color']
        }
      ],
      group: ['expenseCategoryId', 'expenseCategory.id', 'expenseCategory.name', 'expenseCategory.color'],
      raw: true
    });

    res.json({
      cashRegister,
      movementsByType,
      movementsByPaymentMethod,
      expensesByCategory
    });
  } catch (error) {
    console.error('Error fetching cash register report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Helper function to get payment method field name
function getPaymentMethodField(paymentMethod) {
  const methodMap = {
    'cash': 'totalCash',
    'card': 'totalCard',
    'transfer': 'totalTransfer',
    'credit_card': 'totalCreditCard',
    'debit_card': 'totalDebitCard',
    'mercadopago': 'totalMercadoPago'
  };
  return methodMap[paymentMethod] || 'totalOther';
}

// Export movements to CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, cashRegisterId, type, paymentMethod, startDate, endDate } = req.query;

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

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    if (type) {
      where.type = type;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      where.registeredAt = {};
      if (startDate) {
        where.registeredAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.registeredAt[Op.lte] = new Date(endDate + 'T23:59:59');
      }
    }

    const movements = await CashRegisterMovement.findAll({
      where,
      include: [
        { model: CashRegister, as: 'cashRegister', attributes: ['openedAt', 'closedAt'] },
        { model: User, as: 'registeredByUser', attributes: ['firstName', 'lastName'] },
        { model: Order, as: 'order', attributes: ['orderNumber'] },
        { model: Booking, as: 'booking', attributes: ['id'] },
        { model: ExpenseCategory, as: 'expenseCategory', attributes: ['name'] }
      ],
      order: [['registeredAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(movements);

    const typeLabels = {
      'sale': 'Venta',
      'expense': 'Gasto',
      'initial_cash': 'Efectivo Inicial',
      'cash_withdrawal': 'Retiro',
      'adjustment': 'Ajuste'
    };

    const paymentMethodLabels = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'credit_card': 'Tarjeta Crédito',
      'debit_card': 'Tarjeta Débito',
      'mercadopago': 'MercadoPago'
    };

    const csvData = movements.map(mov => ({
      fechaHora: csvUtils.formatDateTimeForCSV(mov.registeredAt),
      tipo: typeLabels[mov.type] || mov.type,
      descripcion: mov.description || '-',
      metodoPago: paymentMethodLabels[mov.paymentMethod] || mov.paymentMethod,
      monto: csvUtils.formatNumberForCSV(mov.amount),
      categoria: mov.expenseCategory?.name || '-',
      ordenReserva: mov.order?.orderNumber || (mov.bookingId ? `Reserva` : '-'),
      usuario: mov.registeredByUser ? `${mov.registeredByUser.firstName} ${mov.registeredByUser.lastName}`.trim() : '-',
      notas: mov.notes || ''
    }));

    const fields = [
      { label: 'Fecha/Hora', value: 'fechaHora' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Descripción', value: 'descripcion' },
      { label: 'Método de Pago', value: 'metodoPago' },
      { label: 'Monto', value: 'monto' },
      { label: 'Categoría', value: 'categoria' },
      { label: 'Orden/Reserva', value: 'ordenReserva' },
      { label: 'Usuario', value: 'usuario' },
      { label: 'Notas', value: 'notas' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `movimientos_caja_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting movements:', error);
    res.status(500).json({ error: 'Failed to export movements', message: error.message });
  }
});

// Export income by payment method
router.get('/income-by-method/export', authenticateToken, async (req, res) => {
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
      type: 'sale',
      amount: { [Op.gt]: 0 }
    };

    if (startDate || endDate) {
      where.registeredAt = {};
      if (startDate) {
        where.registeredAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.registeredAt[Op.lte] = new Date(endDate + 'T23:59:59');
      }
    }

    const incomeByMethod = await CashRegisterMovement.findAll({
      where,
      attributes: [
        'paymentMethod',
        [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['paymentMethod'],
      raw: true
    });

    const csvUtils = require('../utils/csvGenerator');

    const paymentMethodLabels = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'credit_card': 'Tarjeta Crédito',
      'debit_card': 'Tarjeta Débito',
      'mercadopago': 'MercadoPago'
    };

    const totalGeneral = incomeByMethod.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);

    const csvData = incomeByMethod.map(item => ({
      metodoPago: paymentMethodLabels[item.paymentMethod] || item.paymentMethod,
      cantidadOperaciones: item.cantidad,
      montoTotal: csvUtils.formatNumberForCSV(item.total),
      porcentaje: totalGeneral > 0 ? ((parseFloat(item.total) / totalGeneral) * 100).toFixed(2) + '%' : '0%'
    }));

    const fields = [
      { label: 'Método de Pago', value: 'metodoPago' },
      { label: 'Cantidad Operaciones', value: 'cantidadOperaciones' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: 'Porcentaje', value: 'porcentaje' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ingresos_metodo_pago_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting income by method:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
