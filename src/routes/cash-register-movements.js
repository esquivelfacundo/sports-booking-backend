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

    // Get expense category name if provided
    let categoryName = 'Otros';
    if (expenseCategoryId) {
      const expenseCategory = await ExpenseCategory.findByPk(expenseCategoryId);
      if (expenseCategory) {
        categoryName = expenseCategory.name;
      }
    }

    // Create expense record in Expense table
    const expense = await Expense.create({
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

    // Create movement (negative amount for expense)
    const movement = await CashRegisterMovement.create({
      cashRegisterId,
      establishmentId: cashRegister.establishmentId,
      type: 'expense',
      amount: -Math.abs(expenseAmount),
      paymentMethod,
      expenseCategoryId,
      description,
      notes,
      registeredBy: req.user.id,
      registeredAt: new Date()
    }, { transaction });

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

module.exports = router;
