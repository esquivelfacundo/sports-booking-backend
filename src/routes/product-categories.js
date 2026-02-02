const express = require('express');
const router = express.Router();
const { ProductCategory, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// Get all categories for an establishment
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

    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const categories = await ProductCategory.findAll({
      where: { establishmentId },
      order: [['name', 'ASC']]
    });

    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, name, description, color, icon } = req.body;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const category = await ProductCategory.create({
      establishmentId,
      name,
      description,
      color: color || '#3B82F6',
      icon
    });

    res.status(201).json({ category });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await ProductCategory.findByPk(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(category.establishmentId);
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, description, color, icon, isActive } = req.body;

    await category.update({
      name: name || category.name,
      description: description !== undefined ? description : category.description,
      color: color || category.color,
      icon: icon !== undefined ? icon : category.icon,
      isActive: isActive !== undefined ? isActive : category.isActive
    });

    res.json({ category });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await ProductCategory.findByPk(req.params.id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(category.establishmentId);
    const isStaff = req.user.isStaff && req.user.establishmentId === (establishment.id || establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin' && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await category.destroy();

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
