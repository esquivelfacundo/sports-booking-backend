const express = require('express');
const router = express.Router();
const { PaymentMethod, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// Default payment methods to create for new establishments
const DEFAULT_PAYMENT_METHODS = [
  { name: 'Efectivo', code: 'cash', icon: 'Banknote', sortOrder: 1 },
  { name: 'Transferencia', code: 'transfer', icon: 'Building2', sortOrder: 2 },
  { name: 'Credito', code: 'credit_card', icon: 'CreditCard', sortOrder: 3 },
  { name: 'Debito', code: 'debit_card', icon: 'CreditCard', sortOrder: 4 }
];

// Get all payment methods for an establishment
router.get('/establishment/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { includeInactive } = req.query;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    
    // Allow access for: owner, superadmin, or staff of this establishment
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishmentId;
    
    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };
    if (!includeInactive) {
      where.isActive = true;
    }

    const paymentMethods = await PaymentMethod.findAll({
      where,
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    // If no payment methods exist, create defaults
    if (paymentMethods.length === 0) {
      const createdMethods = await Promise.all(
        DEFAULT_PAYMENT_METHODS.map(method => 
          PaymentMethod.create({
            ...method,
            establishmentId,
            isDefault: true,
            isActive: true
          })
        )
      );
      return res.json({ paymentMethods: createdMethods });
    }

    res.json({ paymentMethods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// Create a new payment method
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, name, code, icon } = req.body;

    if (!establishmentId || !name || !code) {
      return res.status(400).json({ error: 'Missing required fields: establishmentId, name, code' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if code already exists for this establishment
    const existing = await PaymentMethod.findOne({
      where: { establishmentId, code }
    });
    if (existing) {
      return res.status(400).json({ error: 'A payment method with this code already exists' });
    }

    // Get max sort order
    const maxOrder = await PaymentMethod.max('sortOrder', { where: { establishmentId } }) || 0;

    const paymentMethod = await PaymentMethod.create({
      establishmentId,
      name,
      code,
      icon: icon || null,
      isDefault: false,
      isActive: true,
      sortOrder: maxOrder + 1
    });

    res.status(201).json({ paymentMethod });
  } catch (error) {
    console.error('Error creating payment method:', error);
    res.status(500).json({ error: 'Failed to create payment method' });
  }
});

// Update a payment method
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, isActive, sortOrder } = req.body;

    const paymentMethod = await PaymentMethod.findByPk(id);
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(paymentMethod.establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update fields
    if (name !== undefined) paymentMethod.name = name;
    if (icon !== undefined) paymentMethod.icon = icon;
    if (isActive !== undefined) paymentMethod.isActive = isActive;
    if (sortOrder !== undefined) paymentMethod.sortOrder = sortOrder;

    await paymentMethod.save();

    res.json({ paymentMethod });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

// Delete a payment method (only non-default ones)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const paymentMethod = await PaymentMethod.findByPk(id);
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(paymentMethod.establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Don't allow deleting default payment methods, just deactivate them
    if (paymentMethod.isDefault) {
      paymentMethod.isActive = false;
      await paymentMethod.save();
      return res.json({ message: 'Default payment method deactivated', paymentMethod });
    }

    await paymentMethod.destroy();
    res.json({ message: 'Payment method deleted' });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

// Initialize default payment methods for an establishment
router.post('/initialize/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if already has payment methods
    const existing = await PaymentMethod.count({ where: { establishmentId } });
    if (existing > 0) {
      return res.status(400).json({ error: 'Payment methods already exist for this establishment' });
    }

    const createdMethods = await Promise.all(
      DEFAULT_PAYMENT_METHODS.map(method => 
        PaymentMethod.create({
          ...method,
          establishmentId,
          isDefault: true,
          isActive: true
        })
      )
    );

    res.status(201).json({ paymentMethods: createdMethods });
  } catch (error) {
    console.error('Error initializing payment methods:', error);
    res.status(500).json({ error: 'Failed to initialize payment methods' });
  }
});

module.exports = router;
