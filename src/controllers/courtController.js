const { Court, Establishment, TimeSlot, Booking } = require('../models');
const { Op } = require('sequelize');

const createCourt = async (req, res) => {
  try {
    const {
      establishmentId,
      name,
      sport,
      surface,
      isIndoor,
      capacity,
      pricePerHour,
      pricePerHour90,
      pricePerHour120,
      amenities,
      dimensions,
      description,
      rules
    } = req.body;

    // Verify establishment ownership
    const establishment = await Establishment.findOne({
      where: { id: establishmentId, userId: req.user.id }
    });

    if (!establishment) {
      return res.status(404).json({
        error: 'Establishment not found',
        message: 'Establishment not found or you do not have permission to add courts to it'
      });
    }

    const court = await Court.create({
      establishmentId,
      name,
      sport,
      surface,
      isIndoor: isIndoor || false,
      capacity: capacity || 4,
      pricePerHour,
      pricePerHour90,
      pricePerHour120,
      amenities: amenities || [],
      dimensions,
      description,
      rules: rules || []
    });

    res.status(201).json({
      message: 'Court created successfully',
      court
    });

  } catch (error) {
    console.error('Create court error:', error);
    res.status(500).json({
      error: 'Failed to create court',
      message: 'An error occurred while creating the court'
    });
  }
};

// Get all courts (general listing)
const getAllCourts = async (req, res) => {
  try {
    const { sport, isIndoor, surface, establishmentId } = req.query;

    const where = { isActive: true };

    if (establishmentId) {
      where.establishmentId = establishmentId;
    }

    if (sport) {
      where.sport = sport;
    }

    if (isIndoor !== undefined) {
      where.isIndoor = isIndoor === 'true';
    }

    if (surface) {
      where.surface = surface;
    }

    const courts = await Court.findAll({
      where,
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city', 'images']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({ 
      success: true,
      data: courts 
    });

  } catch (error) {
    console.error('Get all courts error:', error);
    res.status(500).json({
      error: 'Failed to fetch courts',
      message: 'An error occurred while fetching courts'
    });
  }
};

const getCourts = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { sport, isIndoor, surface } = req.query;

    const where = { establishmentId, isActive: true };

    if (sport) {
      where.sport = sport;
    }

    if (isIndoor !== undefined) {
      where.isIndoor = isIndoor === 'true';
    }

    if (surface) {
      where.surface = surface;
    }

    const courts = await Court.findAll({
      where,
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({ courts });

  } catch (error) {
    console.error('Get courts error:', error);
    res.status(500).json({
      error: 'Failed to fetch courts',
      message: 'An error occurred while fetching courts'
    });
  }
};

const getCourtById = async (req, res) => {
  try {
    const { id } = req.params;

    const court = await Court.findOne({
      where: { id, isActive: true },
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city', 'phone', 'email']
        }
      ]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'The requested court does not exist'
      });
    }

    res.json({ court });

  } catch (error) {
    console.error('Get court error:', error);
    res.status(500).json({
      error: 'Failed to fetch court',
      message: 'An error occurred while fetching the court'
    });
  }
};

const updateCourt = async (req, res) => {
  try {
    const { id } = req.params;

    const court = await Court.findOne({
      where: { id },
      include: [{
        model: Establishment,
        as: 'establishment',
        where: { userId: req.user.id }
      }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'Court not found or you do not have permission to update it'
      });
    }

    const updateData = req.body;
    await court.update(updateData);

    res.json({
      message: 'Court updated successfully',
      court
    });

  } catch (error) {
    console.error('Update court error:', error);
    res.status(500).json({
      error: 'Failed to update court',
      message: 'An error occurred while updating the court'
    });
  }
};

const deleteCourt = async (req, res) => {
  try {
    const { id } = req.params;

    const court = await Court.findOne({
      where: { id },
      include: [{
        model: Establishment,
        as: 'establishment',
        where: { userId: req.user.id }
      }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'Court not found or you do not have permission to delete it'
      });
    }

    // Check for future bookings
    const futureBookings = await Booking.count({
      where: {
        courtId: id,
        date: { [Op.gte]: new Date() },
        status: { [Op.in]: ['pending', 'confirmed'] }
      }
    });

    if (futureBookings > 0) {
      return res.status(400).json({
        error: 'Cannot delete court',
        message: 'Court has future bookings and cannot be deleted'
      });
    }

    // Soft delete by setting isActive to false
    await court.update({ isActive: false });

    res.json({
      message: 'Court deleted successfully'
    });

  } catch (error) {
    console.error('Delete court error:', error);
    res.status(500).json({
      error: 'Failed to delete court',
      message: 'An error occurred while deleting the court'
    });
  }
};

const getCourtAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, duration = 60 } = req.query;

    if (!date) {
      return res.status(400).json({
        error: 'Date required',
        message: 'Please provide a date to check availability'
      });
    }

    const court = await Court.findOne({
      where: { id, isActive: true },
      include: [{
        model: Establishment,
        as: 'establishment',
        attributes: ['openingHours']
      }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'The requested court does not exist'
      });
    }

    // Get existing bookings for the date
    const existingBookings = await Booking.findAll({
      where: {
        courtId: id,
        date,
        status: { [Op.in]: ['pending', 'confirmed'] }
      },
      attributes: ['startTime', 'endTime']
    });

    // Get blocked time slots
    const blockedSlots = await TimeSlot.findAll({
      where: {
        courtId: id,
        date,
        isBlocked: true
      },
      attributes: ['startTime', 'endTime']
    });

    // Generate available time slots based on opening hours
    const dayOfWeek = new Date(date).toLocaleLowerCase('en-US', { weekday: 'long' });
    const openingHours = court.establishment.openingHours[dayOfWeek];

    if (!openingHours || openingHours.closed) {
      return res.json({
        availableSlots: [],
        message: 'Court is closed on this day'
      });
    }

    const availableSlots = generateTimeSlots(
      openingHours.open,
      openingHours.close,
      duration,
      existingBookings,
      blockedSlots,
      court
    );

    res.json({
      availableSlots,
      court: {
        id: court.id,
        name: court.name,
        pricePerHour: court.pricePerHour,
        pricePerHour90: court.pricePerHour90,
        pricePerHour120: court.pricePerHour120
      }
    });

  } catch (error) {
    console.error('Get court availability error:', error);
    res.status(500).json({
      error: 'Failed to get availability',
      message: 'An error occurred while checking court availability'
    });
  }
};

const generateTimeSlots = (openTime, closeTime, duration, bookings, blockedSlots, court) => {
  const slots = [];
  const durationMinutes = parseInt(duration);
  
  // Convert times to minutes for easier calculation
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  
  // Generate slots every 30 minutes
  for (let time = openMinutes; time + durationMinutes <= closeMinutes; time += 30) {
    const startTime = minutesToTime(time);
    const endTime = minutesToTime(time + durationMinutes);
    
    // Check if slot conflicts with existing bookings
    const isBooked = bookings.some(booking => {
      const bookingStart = timeToMinutes(booking.startTime);
      const bookingEnd = timeToMinutes(booking.endTime);
      return (time < bookingEnd && time + durationMinutes > bookingStart);
    });
    
    // Check if slot conflicts with blocked slots
    const isBlocked = blockedSlots.some(slot => {
      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);
      return (time < slotEnd && time + durationMinutes > slotStart);
    });
    
    if (!isBooked && !isBlocked) {
      let price = court.pricePerHour;
      
      // Adjust price based on duration
      if (durationMinutes === 90 && court.pricePerHour90) {
        price = court.pricePerHour90;
      } else if (durationMinutes === 120 && court.pricePerHour120) {
        price = court.pricePerHour120;
      } else if (durationMinutes !== 60) {
        price = (court.pricePerHour / 60) * durationMinutes;
      }
      
      slots.push({
        startTime,
        endTime,
        duration: durationMinutes,
        price: parseFloat(price.toFixed(2)),
        available: true
      });
    }
  }
  
  return slots;
};

const timeToMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

module.exports = {
  createCourt,
  getAllCourts,
  getCourts,
  getCourtById,
  updateCourt,
  deleteCourt,
  getCourtAvailability
};
