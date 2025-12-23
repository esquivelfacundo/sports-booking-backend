const express = require('express');
const router = express.Router();
const { ExpenseCategory, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// Get all expense categories for an establishment
router.get('/', authenticateToken, async (req, res) => {
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

    const categories = await ExpenseCategory.findAll({
      where: { establishmentId },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    res.json({ categories });
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    res.status(500).json({ error: 'Failed to fetch expense categories' });
  }
});

// Create expense category
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, name, description, color } = req.body;

    if (!establishmentId || !name) {
      return res.status(400).json({ error: 'establishmentId and name are required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const category = await ExpenseCategory.create({
      establishmentId,
      name,
      description,
      color: color || '#6B7280',
      isActive: true,
      sortOrder: 0
    });

    res.status(201).json({ category });
  } catch (error) {
    console.error('Error creating expense category:', error);
    res.status(500).json({ error: 'Failed to create expense category' });
  }
});

// Update expense category
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, isActive, sortOrder } = req.body;

    const category = await ExpenseCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ error: 'Expense category not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(category.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await category.update({
      name: name !== undefined ? name : category.name,
      description: description !== undefined ? description : category.description,
      color: color !== undefined ? color : category.color,
      isActive: isActive !== undefined ? isActive : category.isActive,
      sortOrder: sortOrder !== undefined ? sortOrder : category.sortOrder
    });

    res.json({ category });
  } catch (error) {
    console.error('Error updating expense category:', error);
    res.status(500).json({ error: 'Failed to update expense category' });
  }
});

// Delete expense category
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const category = await ExpenseCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ error: 'Expense category not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(category.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await category.destroy();

    res.json({ message: 'Expense category deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense category:', error);
    res.status(500).json({ error: 'Failed to delete expense category' });
  }
});

module.exports = router;
