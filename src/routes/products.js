const express = require('express');
const router = express.Router();
const { Product, ProductCategory, StockMovement, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

// Get all products for an establishment
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;
    const { categoryId, search, isActive } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify user has access to this establishment
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };

    if (categoryId && categoryId !== 'all') {
      where.categoryId = categoryId;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const products = await Product.findAll({
      where,
      include: [
        {
          model: ProductCategory,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      establishmentId,
      categoryId,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice,
      salePrice,
      currentStock,
      minStock,
      maxStock,
      unit,
      trackStock
    } = req.body;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate profit margin
    const profitMargin = costPrice > 0 
      ? ((salePrice - costPrice) / costPrice * 100).toFixed(2)
      : 0;

    const product = await Product.create({
      establishmentId,
      categoryId: categoryId || null,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice: costPrice || 0,
      salePrice: salePrice || 0,
      profitMargin,
      currentStock: currentStock || 0,
      minStock: minStock || 0,
      maxStock,
      unit: unit || 'unidad',
      trackStock: trackStock !== false
    });

    // If initial stock > 0, create stock movement
    if (currentStock > 0) {
      await StockMovement.create({
        establishmentId,
        productId: product.id,
        userId: req.user.id,
        type: 'entrada',
        quantity: currentStock,
        previousStock: 0,
        newStock: currentStock,
        unitCost: costPrice,
        totalCost: costPrice * currentStock,
        reason: 'Stock inicial'
      });
    }

    const createdProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    res.status(201).json({ product: createdProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      categoryId,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice,
      salePrice,
      minStock,
      maxStock,
      unit,
      trackStock,
      isActive
    } = req.body;

    // Calculate profit margin if prices changed
    let profitMargin = product.profitMargin;
    const newCostPrice = costPrice !== undefined ? costPrice : product.costPrice;
    const newSalePrice = salePrice !== undefined ? salePrice : product.salePrice;
    
    if (newCostPrice > 0) {
      profitMargin = ((newSalePrice - newCostPrice) / newCostPrice * 100).toFixed(2);
    }

    await product.update({
      categoryId: categoryId !== undefined ? categoryId : product.categoryId,
      name: name || product.name,
      description: description !== undefined ? description : product.description,
      barcode: barcode !== undefined ? barcode : product.barcode,
      sku: sku !== undefined ? sku : product.sku,
      image: image !== undefined ? image : product.image,
      costPrice: newCostPrice,
      salePrice: newSalePrice,
      profitMargin,
      minStock: minStock !== undefined ? minStock : product.minStock,
      maxStock: maxStock !== undefined ? maxStock : product.maxStock,
      unit: unit || product.unit,
      trackStock: trackStock !== undefined ? trackStock : product.trackStock,
      isActive: isActive !== undefined ? isActive : product.isActive
    });

    const updatedProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    res.json({ product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Soft delete - just mark as inactive
    await product.update({ isActive: false });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get products with low stock
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;

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

    const products = await Product.findAll({
      where: {
        establishmentId,
        isActive: true,
        trackStock: true,
        currentStock: {
          [Op.lte]: Product.sequelize.col('minStock')
        }
      },
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ],
      order: [['currentStock', 'ASC']]
    });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

module.exports = router;
