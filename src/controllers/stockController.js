const { StockMovement, Product, User } = require('../models');
const { Op } = require('sequelize');

/**
 * Get purchases by product for a given period
 */
const getPurchasesByProduct = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let start;
    
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

    // Get all purchase movements (entrada type) in the period
    const movements = await StockMovement.findAll({
      where: {
        establishmentId,
        type: 'entrada',
        createdAt: { [Op.gte]: start },
        unitCost: { [Op.not]: null }
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'unit']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Group by product
    const purchasesByProduct = {};

    movements.forEach(movement => {
      const productId = movement.productId;
      const productName = movement.product?.name || 'Producto desconocido';
      const unit = movement.product?.unit || 'unidad';
      
      if (!purchasesByProduct[productId]) {
        purchasesByProduct[productId] = {
          productId,
          productName,
          unit,
          totalQuantity: 0,
          totalCost: 0,
          purchases: []
        };
      }

      const quantity = Math.abs(movement.quantity);
      const unitCost = parseFloat(movement.unitCost || 0);
      const totalCost = parseFloat(movement.totalCost || 0);

      purchasesByProduct[productId].totalQuantity += quantity;
      purchasesByProduct[productId].totalCost += totalCost;
      purchasesByProduct[productId].purchases.push({
        id: movement.id,
        date: movement.createdAt,
        quantity,
        unitCost,
        totalCost,
        invoiceNumber: movement.invoiceNumber,
        notes: movement.notes,
        user: movement.user?.name
      });
    });

    // Convert to array and sort by total cost descending
    const productPurchases = Object.values(purchasesByProduct)
      .sort((a, b) => b.totalCost - a.totalCost);

    // Calculate totals
    const totals = {
      totalProducts: productPurchases.length,
      totalQuantity: productPurchases.reduce((sum, p) => sum + p.totalQuantity, 0),
      totalCost: productPurchases.reduce((sum, p) => sum + p.totalCost, 0),
      totalPurchases: movements.length
    };

    res.json({
      success: true,
      period: {
        start: start.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        label: period
      },
      totals,
      products: productPurchases
    });

  } catch (error) {
    console.error('Purchases by product error:', error);
    res.status(500).json({
      error: 'Failed to get purchases by product',
      message: error.message
    });
  }
};

module.exports = {
  getPurchasesByProduct
};
