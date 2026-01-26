const { Expense, User, CashRegister, Establishment } = require('../models');
const { Op } = require('sequelize');

/**
 * Get expenses for an establishment
 */
const getExpenses = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { 
      period = 'month', 
      userId, 
      cashRegisterId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate date range based on period
    const now = new Date();
    let start, end = now;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch (period) {
        case 'day':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
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

    const where = {
      establishmentId,
      expenseDate: {
        [Op.between]: [start.toISOString().split('T')[0], end.toISOString().split('T')[0]]
      }
    };

    if (userId) {
      where.userId = userId;
    }

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    const expenses = await Expense.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: CashRegister,
          as: 'cashRegister',
          attributes: ['id', 'openedAt', 'closedAt']
        }
      ],
      order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Format expenses with user name
    const formattedExpenses = expenses.map(expense => {
      const expenseJson = expense.toJSON ? expense.toJSON() : expense;
      if (expenseJson.user) {
        expenseJson.user.name = `${expenseJson.user.firstName || ''} ${expenseJson.user.lastName || ''}`.trim();
      }
      return expenseJson;
    });

    const total = await Expense.count({ where });

    // Calculate totals
    const totalAmount = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    res.json({
      success: true,
      expenses: formattedExpenses,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      summary: {
        totalExpenses: total,
        totalAmount
      }
    });

  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      error: 'Failed to get expenses',
      message: error.message
    });
  }
};

/**
 * Create a new expense
 */
const createExpense = async (req, res) => {
  try {
    const {
      establishmentId,
      cashRegisterId,
      category,
      description,
      amount,
      paymentMethod,
      invoiceNumber,
      supplier,
      notes,
      expenseDate
    } = req.body;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate required fields
    if (!category || !description || !amount) {
      return res.status(400).json({ error: 'Category, description, and amount are required' });
    }

    // Create expense
    const expense = await Expense.create({
      establishmentId,
      cashRegisterId: cashRegisterId || null,
      userId: req.user.id,
      category,
      description,
      amount,
      paymentMethod,
      invoiceNumber,
      supplier,
      notes,
      expenseDate: expenseDate || new Date().toISOString().split('T')[0]
    });

    // Fetch complete expense data
    const createdExpense = await Expense.findByPk(expense.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: CashRegister,
          as: 'cashRegister',
          attributes: ['id', 'openedAt', 'closedAt']
        }
      ]
    });

    // Format with user name
    const expenseJson = createdExpense.toJSON ? createdExpense.toJSON() : createdExpense;
    if (expenseJson.user) {
      expenseJson.user.name = `${expenseJson.user.firstName || ''} ${expenseJson.user.lastName || ''}`.trim();
    }

    res.status(201).json({
      success: true,
      expense: expenseJson
    });

  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      error: 'Failed to create expense',
      message: error.message
    });
  }
};

/**
 * Update an expense
 */
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      category,
      description,
      amount,
      paymentMethod,
      invoiceNumber,
      supplier,
      notes,
      expenseDate
    } = req.body;

    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(expense.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update expense
    await expense.update({
      category: category || expense.category,
      description: description || expense.description,
      amount: amount !== undefined ? amount : expense.amount,
      paymentMethod: paymentMethod !== undefined ? paymentMethod : expense.paymentMethod,
      invoiceNumber: invoiceNumber !== undefined ? invoiceNumber : expense.invoiceNumber,
      supplier: supplier !== undefined ? supplier : expense.supplier,
      notes: notes !== undefined ? notes : expense.notes,
      expenseDate: expenseDate || expense.expenseDate
    });

    // Fetch updated expense
    const updatedExpense = await Expense.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: CashRegister,
          as: 'cashRegister',
          attributes: ['id', 'openedAt', 'closedAt']
        }
      ]
    });

    // Format with user name
    const expenseJson = updatedExpense.toJSON ? updatedExpense.toJSON() : updatedExpense;
    if (expenseJson.user) {
      expenseJson.user.name = `${expenseJson.user.firstName || ''} ${expenseJson.user.lastName || ''}`.trim();
    }

    res.json({
      success: true,
      expense: expenseJson
    });

  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({
      error: 'Failed to update expense',
      message: error.message
    });
  }
};

/**
 * Delete an expense
 */
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(expense.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await expense.destroy();

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });

  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      error: 'Failed to delete expense',
      message: error.message
    });
  }
};

/**
 * Get expense categories
 */
const getExpenseCategories = async (req, res) => {
  try {
    const categories = [
      'Servicios',
      'Mantenimiento',
      'Suministros',
      'Salarios',
      'Impuestos',
      'Alquiler',
      'Marketing',
      'Transporte',
      'Equipamiento',
      'Otros'
    ];

    res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({
      error: 'Failed to get expense categories',
      message: error.message
    });
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories
};
