const express = require('express');
const router = express.Router();
const { Amenity, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// Get all amenities for an establishment
router.get('/establishment/:establishmentId', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { includeInactive, publicOnly } = req.query;

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
    
    // If publicOnly, only return amenities visible to clients
    if (publicOnly === 'true') {
      where.isPublic = true;
    }

    const amenities = await Amenity.findAll({
      where,
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    res.json({ amenities });
  } catch (error) {
    console.error('Error fetching amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get public amenities for an establishment (no auth required - for client booking page)
router.get('/public/:establishmentId', async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    const amenities = await Amenity.findAll({
      where: {
        establishmentId,
        isActive: true,
        isPublic: true,
        isBookable: true
      },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    res.json({ amenities });
  } catch (error) {
    console.error('Error fetching public amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get single amenity
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const amenity = await Amenity.findByPk(id, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!amenity) {
      return res.status(404).json({ error: 'Amenity not found' });
    }

    // Verify access
    const establishment = amenity.establishment;
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishment.id;

    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ amenity });
  } catch (error) {
    console.error('Error fetching amenity:', error);
    res.status(500).json({ error: 'Failed to fetch amenity' });
  }
});

// Create amenity
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      establishmentId,
      name,
      description,
      icon,
      images,
      pricePerHour,
      pricePerHour90,
      pricePerHour120,
      isBookable,
      isPublic,
      capacity,
      customSchedule,
      sortOrder
    } = req.body;

    if (!establishmentId || !name) {
      return res.status(400).json({ error: 'Missing required fields: establishmentId, name' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishmentId;

    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get max sort order if not provided
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const maxOrder = await Amenity.max('sortOrder', { where: { establishmentId } }) || 0;
      finalSortOrder = maxOrder + 1;
    }

    const amenity = await Amenity.create({
      establishmentId,
      name,
      description,
      icon,
      images: images || [],
      pricePerHour: pricePerHour || 0,
      pricePerHour90,
      pricePerHour120,
      isBookable: isBookable !== false,
      isPublic: isPublic !== false,
      isActive: true,
      capacity,
      customSchedule,
      sortOrder: finalSortOrder
    });

    res.status(201).json({ amenity });
  } catch (error) {
    console.error('Error creating amenity:', error);
    res.status(500).json({ error: 'Failed to create amenity' });
  }
});

// Update amenity
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const amenity = await Amenity.findByPk(id, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!amenity) {
      return res.status(404).json({ error: 'Amenity not found' });
    }

    // Verify access
    const establishment = amenity.establishment;
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';
    const isStaffOfEstablishment = req.user.isStaff && req.user.establishmentId === establishment.id;

    if (!isOwner && !isSuperadmin && !isStaffOfEstablishment) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Don't allow changing establishmentId
    delete updates.establishmentId;
    delete updates.id;

    await amenity.update(updates);

    res.json({ amenity });
  } catch (error) {
    console.error('Error updating amenity:', error);
    res.status(500).json({ error: 'Failed to update amenity' });
  }
});

// Delete amenity (soft delete - set isActive to false)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const amenity = await Amenity.findByPk(id, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!amenity) {
      return res.status(404).json({ error: 'Amenity not found' });
    }

    // Verify access
    const establishment = amenity.establishment;
    const isOwner = establishment.userId === req.user.id;
    const isSuperadmin = req.user.userType === 'superadmin';

    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await amenity.update({ isActive: false });

    res.json({ message: 'Amenity deleted successfully' });
  } catch (error) {
    console.error('Error deleting amenity:', error);
    res.status(500).json({ error: 'Failed to delete amenity' });
  }
});

module.exports = router;
