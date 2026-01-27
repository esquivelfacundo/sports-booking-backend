const express = require('express');
const router = express.Router();
const { StockMovement, Product, ProductCategory, User, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getPurchasesByProduct } = require('../controllers/stockController');

// Get stock movements
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, productId, type, startDate, endDate, limit = 50, offset = 0 } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };

    if (productId) {
      where.productId = productId;
    }

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    const movements = await StockMovement.findAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'barcode', 'unit'],
          include: [
            {
              model: ProductCategory,
              as: 'category',
              attributes: ['id', 'name', 'color']
            }
          ]
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Add user name to each movement
    const movementsWithUserName = movements.map(m => {
      const movement = m.toJSON ? m.toJSON() : m;
      if (movement.user) {
        movement.user.name = `${movement.user.firstName || ''} ${movement.user.lastName || ''}`.trim();
      }
      return movement;
    });

    const total = await StockMovement.count({ where });

    res.json({ 
      movements: movementsWithUserName,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// Create stock movement (entrada, salida, ajuste)
router.post('/', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      establishmentId,
      productId,
      type,
      quantity,
      unitCost,
      reason,
      notes,
      invoiceNumber
    } = req.body;

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

    // Get product
    const product = await Product.findByPk(productId, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.trackStock) {
      await transaction.rollback();
      return res.status(400).json({ error: 'This product does not track stock' });
    }

    const previousStock = product.currentStock;
    let newStock;
    let movementQuantity;

    // Calculate new stock based on movement type
    switch (type) {
      case 'entrada':
        newStock = previousStock + quantity;
        movementQuantity = quantity;
        break;
      case 'salida':
      case 'merma':
        if (quantity > previousStock) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Insufficient stock' });
        }
        newStock = previousStock - quantity;
        movementQuantity = -quantity;
        break;
      case 'ajuste':
        // For adjustments, quantity is the new stock value
        newStock = quantity;
        movementQuantity = quantity - previousStock;
        break;
      default:
        await transaction.rollback();
        return res.status(400).json({ error: 'Invalid movement type' });
    }

    // Update product stock
    await product.update({ currentStock: newStock }, { transaction });

    // Create movement record
    const totalCost = unitCost ? unitCost * Math.abs(movementQuantity) : null;
    
    const movement = await StockMovement.create({
      establishmentId,
      productId,
      userId: req.user.id,
      type,
      quantity: movementQuantity,
      previousStock,
      newStock,
      unitCost,
      totalCost,
      reason,
      notes,
      invoiceNumber
    }, { transaction });

    await transaction.commit();

    // Fetch complete movement data
    const createdMovement = await StockMovement.findByPk(movement.id, {
      include: [
        {
          model: Product,
          as: 'product',
          include: [
            {
              model: ProductCategory,
              as: 'category'
            }
          ]
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    // Add user name to created movement
    const movementJson = createdMovement.toJSON ? createdMovement.toJSON() : createdMovement;
    if (movementJson.user) {
      movementJson.user.name = `${movementJson.user.firstName || ''} ${movementJson.user.lastName || ''}`.trim();
    }

    res.status(201).json({ movement: movementJson });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating stock movement:', error);
    res.status(500).json({ error: 'Failed to create stock movement' });
  }
});

// Get stock summary/report
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, startDate, endDate } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

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
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Get movement counts by type
    const movementsByType = await StockMovement.findAll({
      where,
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('totalCost')), 'totalValue']
      ],
      group: ['type']
    });

    // Get total inventory value
    const products = await Product.findAll({
      where: { 
        establishmentId,
        isActive: true,
        trackStock: true
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.literal('currentStock * costPrice')), 'totalValue'],
        [sequelize.fn('SUM', sequelize.col('currentStock')), 'totalUnits']
      ]
    });

    // Get low stock count
    const lowStockCount = await Product.count({
      where: {
        establishmentId,
        isActive: true,
        trackStock: true,
        currentStock: {
          [Op.lte]: sequelize.col('minStock')
        }
      }
    });

    res.json({
      movementsByType,
      inventoryValue: products[0]?.dataValues?.totalValue || 0,
      totalUnits: products[0]?.dataValues?.totalUnits || 0,
      lowStockCount
    });
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    res.status(500).json({ error: 'Failed to fetch stock summary' });
  }
});

// Get purchases by product
router.get('/purchases-by-product/:establishmentId', authenticateToken, getPurchasesByProduct);

// Export all stock movements to CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, productId, type, startDate, endDate } = req.query;

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

    if (productId) where.productId = productId;
    if (type) where.type = type;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    const movements = await StockMovement.findAll({
      where,
      include: [
        { model: Product, as: 'product', attributes: ['name', 'sku', 'unit'] },
        { model: User, as: 'user', attributes: ['firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(movements);

    const typeLabels = {
      'entrada': 'Entrada',
      'salida': 'Salida',
      'ajuste': 'Ajuste',
      'venta': 'Venta',
      'merma': 'Merma'
    };

    const csvData = movements.map(mov => ({
      fecha: csvUtils.formatDateTimeForCSV(mov.createdAt),
      producto: mov.product?.name || '-',
      sku: mov.product?.sku || '-',
      tipo: typeLabels[mov.type] || mov.type,
      cantidad: mov.quantity,
      unidad: mov.product?.unit || '-',
      costoUnitario: csvUtils.formatNumberForCSV(mov.unitCost),
      costoTotal: csvUtils.formatNumberForCSV(mov.totalCost),
      stockAnterior: mov.previousStock || 0,
      stockNuevo: mov.newStock || 0,
      usuario: mov.user ? `${mov.user.firstName} ${mov.user.lastName}`.trim() : '-',
      notas: mov.notes || ''
    }));

    const fields = [
      { label: 'Fecha', value: 'fecha' },
      { label: 'Producto', value: 'producto' },
      { label: 'SKU', value: 'sku' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Cantidad', value: 'cantidad' },
      { label: 'Unidad', value: 'unidad' },
      { label: 'Costo Unitario', value: 'costoUnitario' },
      { label: 'Costo Total', value: 'costoTotal' },
      { label: 'Stock Anterior', value: 'stockAnterior' },
      { label: 'Stock Nuevo', value: 'stockNuevo' },
      { label: 'Usuario', value: 'usuario' },
      { label: 'Notas', value: 'notas' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `movimientos_stock_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting stock movements:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

// Export purchases (stock entries) to CSV
router.get('/purchases/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, startDate, endDate, supplierId } = req.query;

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
      type: 'entrada'
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    const movements = await StockMovement.findAll({
      where,
      include: [
        { model: Product, as: 'product', attributes: ['name', 'sku', 'unit'] },
        { model: User, as: 'user', attributes: ['firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(movements);

    const csvData = movements.map(mov => ({
      fecha: csvUtils.formatDateTimeForCSV(mov.createdAt),
      producto: mov.product?.name || '-',
      sku: mov.product?.sku || '-',
      cantidad: mov.quantity,
      unidad: mov.product?.unit || '-',
      costoUnitario: csvUtils.formatNumberForCSV(mov.unitCost),
      costoTotal: csvUtils.formatNumberForCSV(mov.totalCost),
      proveedor: mov.supplierName || '-',
      factura: mov.invoiceNumber || '-',
      usuario: mov.user ? `${mov.user.firstName} ${mov.user.lastName}`.trim() : '-',
      notas: mov.notes || ''
    }));

    const fields = [
      { label: 'Fecha', value: 'fecha' },
      { label: 'Producto', value: 'producto' },
      { label: 'SKU', value: 'sku' },
      { label: 'Cantidad', value: 'cantidad' },
      { label: 'Unidad', value: 'unidad' },
      { label: 'Costo Unitario', value: 'costoUnitario' },
      { label: 'Costo Total', value: 'costoTotal' },
      { label: 'Proveedor', value: 'proveedor' },
      { label: 'Factura', value: 'factura' },
      { label: 'Usuario', value: 'usuario' },
      { label: 'Notas', value: 'notas' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `compras_proveedores_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting purchases:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
