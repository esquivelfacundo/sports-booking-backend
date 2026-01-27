const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  exportExpenses
} = require('../controllers/expenseController');

// All routes require authentication
router.use(authenticateToken);

// Get expense categories
router.get('/categories', getExpenseCategories);

// Export expenses to CSV
router.get('/establishment/:establishmentId/export', exportExpenses);

// Export expenses by category to CSV
const { Expense, Establishment } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

router.get('/by-category/export', async (req, res) => {
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

    const where = { establishmentId };
    if (startDate) where.expenseDate = { [Op.gte]: startDate };
    if (endDate) where.expenseDate = { ...where.expenseDate, [Op.lte]: endDate };

    const expensesByCategory = await Expense.findAll({
      where,
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['category'],
      raw: true
    });

    const csvUtils = require('../utils/csvGenerator');
    const totalGeneral = expensesByCategory.reduce((sum, cat) => sum + parseFloat(cat.total || 0), 0);

    const csvData = expensesByCategory.map(cat => ({
      categoria: cat.category,
      cantidadGastos: cat.cantidad,
      montoTotal: csvUtils.formatNumberForCSV(cat.total),
      porcentaje: totalGeneral > 0 ? ((parseFloat(cat.total) / totalGeneral) * 100).toFixed(2) + '%' : '0%',
      promedioGasto: csvUtils.formatNumberForCSV(cat.cantidad > 0 ? cat.total / cat.cantidad : 0)
    }));

    const fields = [
      { label: 'Categoría', value: 'categoria' },
      { label: 'Cantidad Gastos', value: 'cantidadGastos' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: 'Porcentaje', value: 'porcentaje' },
      { label: 'Promedio por Gasto', value: 'promedioGasto' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `gastos_por_categoria_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting expenses by category:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export expenses by supplier to CSV
router.get('/by-supplier/export', async (req, res) => {
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

    const where = { establishmentId };
    if (startDate) where.expenseDate = { [Op.gte]: startDate };
    if (endDate) where.expenseDate = { ...where.expenseDate, [Op.lte]: endDate };

    const expensesBySupplier = await Expense.findAll({
      where,
      attributes: [
        'supplierName',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['supplierName'],
      order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
      raw: true
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(expensesBySupplier);

    const totalExpenses = expensesBySupplier.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

    const csvData = expensesBySupplier.map((supplier, index) => ({
      ranking: index + 1,
      proveedor: supplier.supplierName || 'Sin proveedor',
      cantidadGastos: parseInt(supplier.count) || 0,
      montoTotal: csvUtils.formatNumberForCSV(supplier.total || 0),
      porcentaje: totalExpenses > 0 ? ((parseFloat(supplier.total || 0) / totalExpenses) * 100).toFixed(2) + '%' : '0%',
      promedioGasto: csvUtils.formatNumberForCSV(supplier.count > 0 ? (supplier.total / supplier.count) : 0)
    }));

    const fields = [
      { label: 'Ranking', value: 'ranking' },
      { label: 'Proveedor', value: 'proveedor' },
      { label: 'Cantidad Gastos', value: 'cantidadGastos' },
      { label: 'Monto Total', value: 'montoTotal' },
      { label: 'Porcentaje', value: 'porcentaje' },
      { label: 'Promedio por Gasto', value: 'promedioGasto' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `gastos_por_proveedor_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting expenses by supplier:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Get expenses for an establishment
router.get('/establishment/:establishmentId', getExpenses);

// Create a new expense
router.post('/', createExpense);

// Update an expense
router.put('/:id', updateExpense);

// Delete an expense
router.delete('/:id', deleteExpense);

module.exports = router;
