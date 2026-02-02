const express = require('express');
const router = express.Router();
const { BookingConsumption, Booking, Product, Establishment, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

// Get consumptions for a booking
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Verify booking exists and user has access
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check access - allow booking owner, establishment owner, superadmin, or staff of the establishment
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.establishmentId;
    if (booking.userId !== req.user.id && 
        booking.establishment.userId !== req.user.id && 
        req.user.userType !== 'superadmin' &&
        !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get consumptions with raw query to avoid Sequelize column name issues
    const consumptions = await BookingConsumption.findAll({
      where: { bookingId },
      order: [['createdAt', 'DESC']],
      raw: true
    });

    // Get product details for each consumption
    const consumptionsWithProducts = await Promise.all(
      consumptions.map(async (consumption) => {
        const product = await Product.findByPk(consumption.productId, {
          attributes: ['id', 'name', 'unit', 'salePrice', 'image', 'categoryId'],
          raw: true
        });
        
        let category = null;
        if (product?.categoryId) {
          const ProductCategory = require('../models').ProductCategory;
          category = await ProductCategory.findByPk(product.categoryId, {
            attributes: ['id', 'name', 'color'],
            raw: true
          });
        }

        return {
          ...consumption,
          product: product ? {
            ...product,
            category
          } : null
        };
      })
    );

    // Calculate total
    const total = consumptionsWithProducts.reduce((sum, c) => sum + parseFloat(c.totalPrice || 0), 0);

    res.json({ 
      consumptions: consumptionsWithProducts,
      total,
      count: consumptionsWithProducts.length
    });
  } catch (error) {
    console.error('Error fetching booking consumptions:', error);
    res.status(500).json({ error: 'Failed to fetch consumptions' });
  }
});

// Add consumption to booking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { bookingId, productId, quantity, notes } = req.body;

    if (!bookingId || !productId || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify booking exists
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check access - allow establishment owner, superadmin, or staff of the establishment
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.establishmentId;
    if (booking.establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get product
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.isActive) {
      return res.status(400).json({ error: 'Product is not active' });
    }

    // Check if product belongs to the same establishment
    if (product.establishmentId !== booking.establishmentId) {
      return res.status(400).json({ error: 'Product does not belong to this establishment' });
    }

    // Stock can go negative - no validation needed
    // This allows sales even when stock entry hasn't been recorded yet

    const unitPrice = parseFloat(product.salePrice);
    const totalPrice = unitPrice * quantity;

    // Create consumption
    const consumption = await BookingConsumption.create({
      bookingId,
      productId,
      establishmentId: booking.establishmentId,
      quantity,
      unitPrice,
      totalPrice,
      notes: notes || null,
      addedBy: req.user.id
    });

    // Update product stock if tracked
    if (product.trackStock) {
      await product.update({
        currentStock: product.currentStock - quantity
      });

      // Create stock movement
      const StockMovement = require('../models').StockMovement;
      await StockMovement.create({
        establishmentId: booking.establishmentId,
        productId,
        type: 'venta',
        quantity: -quantity,
        previousStock: product.currentStock + quantity,
        newStock: product.currentStock,
        unitCost: product.costPrice,
        totalCost: product.costPrice * quantity,
        notes: `Venta en reserva #${booking.id.substring(0, 8)}`,
        userId: req.user.id
      });
    }

    // Return the created consumption with product info (without problematic JOINs)
    const ProductCategory = require('../models').ProductCategory;
    let category = null;
    if (product.categoryId) {
      category = await ProductCategory.findByPk(product.categoryId, {
        attributes: ['id', 'name', 'color'],
        raw: true
      });
    }

    const responseConsumption = {
      id: consumption.id,
      bookingId: consumption.bookingId,
      productId: consumption.productId,
      establishmentId: consumption.establishmentId,
      quantity: consumption.quantity,
      unitPrice: consumption.unitPrice,
      totalPrice: consumption.totalPrice,
      notes: consumption.notes,
      addedBy: consumption.addedBy,
      createdAt: consumption.createdAt,
      updatedAt: consumption.updatedAt,
      product: {
        id: product.id,
        name: product.name,
        unit: product.unit,
        salePrice: product.salePrice,
        image: product.image,
        category
      }
    };

    res.status(201).json({ consumption: responseConsumption });
  } catch (error) {
    console.error('Error adding consumption:', error);
    res.status(500).json({ error: 'Failed to add consumption' });
  }
});

// Update consumption quantity
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // Get consumption without problematic JOINs
    const consumption = await BookingConsumption.findByPk(id, { raw: true });
    if (!consumption) {
      return res.status(404).json({ error: 'Consumption not found' });
    }

    // Get booking and establishment for access check
    const booking = await Booking.findByPk(consumption.bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    // Check access - allow establishment owner, superadmin, or staff of the establishment
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.establishmentId;
    if (booking.establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get product
    const product = await Product.findByPk(consumption.productId);

    const oldQuantity = consumption.quantity;
    const quantityDiff = quantity - oldQuantity;

    // Stock can go negative - no validation needed when increasing quantity
    // This allows sales even when stock entry hasn't been recorded yet

    // Update consumption
    const totalPrice = parseFloat(consumption.unitPrice) * quantity;
    await BookingConsumption.update(
      { quantity, totalPrice },
      { where: { id } }
    );

    // Update product stock if tracked
    if (product.trackStock && quantityDiff !== 0) {
      const newStock = product.currentStock - quantityDiff;
      await product.update({ currentStock: newStock });

      // Create stock movement
      const StockMovement = require('../models').StockMovement;
      await StockMovement.create({
        establishmentId: consumption.establishmentId,
        productId: consumption.productId,
        type: quantityDiff > 0 ? 'venta' : 'ajuste',
        quantity: -quantityDiff,
        previousStock: product.currentStock,
        newStock: newStock,
        unitCost: product.costPrice,
        totalCost: Math.abs(product.costPrice * quantityDiff),
        notes: `Ajuste de consumo en reserva #${consumption.bookingId.substring(0, 8)}`,
        userId: req.user.id
      });
    }

    // Return updated consumption
    const ProductCategory = require('../models').ProductCategory;
    let category = null;
    if (product.categoryId) {
      category = await ProductCategory.findByPk(product.categoryId, {
        attributes: ['id', 'name', 'color'],
        raw: true
      });
    }

    const responseConsumption = {
      ...consumption,
      quantity,
      totalPrice,
      product: {
        id: product.id,
        name: product.name,
        unit: product.unit,
        salePrice: product.salePrice,
        image: product.image,
        category
      }
    };

    res.json({ consumption: responseConsumption });
  } catch (error) {
    console.error('Error updating consumption:', error);
    res.status(500).json({ error: 'Failed to update consumption' });
  }
});

// Delete consumption
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get consumption without problematic JOINs
    const consumption = await BookingConsumption.findByPk(id, { raw: true });
    if (!consumption) {
      return res.status(404).json({ error: 'Consumption not found' });
    }

    // Get booking and establishment for access check
    const booking = await Booking.findByPk(consumption.bookingId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    // Check access - allow establishment owner, superadmin, or staff of the establishment
    const isStaff = req.user.isStaff && req.user.establishmentId === booking.establishmentId;
    if (booking.establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get product
    const product = await Product.findByPk(consumption.productId);

    // Restore product stock if tracked
    if (product && product.trackStock) {
      const newStock = product.currentStock + consumption.quantity;
      await product.update({ currentStock: newStock });

      // Create stock movement
      const StockMovement = require('../models').StockMovement;
      await StockMovement.create({
        establishmentId: consumption.establishmentId,
        productId: consumption.productId,
        type: 'ajuste',
        quantity: consumption.quantity,
        previousStock: product.currentStock,
        newStock: newStock,
        unitCost: product.costPrice,
        totalCost: product.costPrice * consumption.quantity,
        notes: `Eliminación de consumo en reserva #${consumption.bookingId.substring(0, 8)}`,
        userId: req.user.id
      });
    }

    await BookingConsumption.destroy({ where: { id } });

    res.json({ message: 'Consumption deleted successfully' });
  } catch (error) {
    console.error('Error deleting consumption:', error);
    res.status(500).json({ error: 'Failed to delete consumption' });
  }
});

module.exports = router;
