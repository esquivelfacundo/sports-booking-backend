const { Court, Establishment, TimeSlot, Booking, CourtPriceSchedule } = require('../models');
const { Op } = require('sequelize');

// Helper function to verify establishment access (includes staff)
const verifyEstablishmentAccess = async (req, establishmentId) => {
  const isAdmin = req.user.userType === 'admin';
  const isStaff = req.user.isStaff && req.user.establishmentId === establishmentId;
  
  if (isAdmin || isStaff) {
    return await Establishment.findByPk(establishmentId);
  }
  
  return await Establishment.findOne({
    where: { id: establishmentId, userId: req.user.id }
  });
};

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
      rules,
      priceSchedules
    } = req.body;

    // Verify establishment access (includes staff)
    const establishment = await verifyEstablishmentAccess(req, establishmentId);

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

    // Create price schedules if provided
    if (priceSchedules && Array.isArray(priceSchedules) && priceSchedules.length > 0) {
      try {
        for (const [index, schedule] of priceSchedules.entries()) {
          await CourtPriceSchedule.create({
            courtId: court.id,
            name: schedule.name || `Franja ${index + 1}`,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            pricePerHour: parseFloat(schedule.pricePerHour) || 0,
            daysOfWeek: schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
            priority: schedule.priority || index,
            isActive: true
          });
        }
      } catch (scheduleError) {
        console.error('Error creating price schedules:', scheduleError.message);
      }
    }

    // Fetch court with price schedules
    let courtWithSchedules;
    try {
      courtWithSchedules = await Court.findByPk(court.id, {
        include: [{ model: CourtPriceSchedule, as: 'priceSchedules' }]
      });
    } catch (e) {
      courtWithSchedules = court;
    }

    res.status(201).json({
      message: 'Court created successfully',
      court: courtWithSchedules
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
  console.log('🚨 getAllCourts CALLED - VERSION 3.0');
  console.log('🚨 Request query:', req.query);
  
  try {
    const { establishmentId, sport, isIndoor, surface } = req.query;

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

    console.log('🔍 Loading courts with priceSchedules...');
    
    const courts = await Court.findAll({
      where,
      include: [
        {
          model: Establishment,
          as: 'establishment',
          attributes: ['id', 'name', 'address', 'city', 'images']
        },
        {
          model: CourtPriceSchedule,
          as: 'priceSchedules',
          required: false
        }
      ],
      order: [['name', 'ASC']]
    });

    console.log(`✅ Loaded ${courts.length} courts`);
    courts.forEach(court => {
      const schedules = court.priceSchedules || [];
      console.log(`  - ${court.name}: ${schedules.length} schedules`);
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
  console.log('🚨 getCourts CALLED - VERSION 3.0');
  console.log('🚨 Request params:', req.params);
  console.log('🚨 Request query:', req.query);
  
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

    console.log('🔍 Attempting to load courts with priceSchedules...');
    console.log('🔍 CourtPriceSchedule model:', CourtPriceSchedule ? 'EXISTS' : 'MISSING');
    
    let courts;
    try {
      courts = await Court.findAll({
        where,
        include: [
          {
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city']
          },
          {
            model: CourtPriceSchedule,
            as: 'priceSchedules',
            required: false
          }
        ],
        order: [['name', 'ASC']]
      });
      
      console.log(`✅ Loaded ${courts.length} courts with price schedules`);
      courts.forEach(court => {
        const activeSchedules = court.priceSchedules?.filter(s => s.isActive) || [];
        console.log(`  - ${court.name}: ${activeSchedules.length} active schedules (${court.priceSchedules?.length || 0} total)`);
      });
    } catch (includeError) {
      console.error('❌ Error loading courts WITH priceSchedules:', includeError.message);
      console.error('❌ Falling back to courts WITHOUT priceSchedules');
      
      // Fallback: load courts without schedules
      courts = await Court.findAll({
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
      
      console.log(`⚠️  Loaded ${courts.length} courts WITHOUT schedules (fallback)`);
    }

    res.json({ success: true, data: courts });

  } catch (error) {
    console.error('❌ Get courts error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch courts',
      message: 'An error occurred while fetching courts'
    });
  }
};

console.log('🔧 courtController.js loaded - VERSION 2.0 with priceSchedules support');

const getCourtById = async (req, res) => {
  try {
    const { id } = req.params;

    let court;
    try {
      court = await Court.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city', 'phone', 'email']
          },
          {
            model: CourtPriceSchedule,
            as: 'priceSchedules',
            where: { isActive: true },
            required: false
          }
        ]
      });
    } catch (e) {
      court = await Court.findOne({
        where: { id, isActive: true },
        include: [
          {
            model: Establishment,
            as: 'establishment',
            attributes: ['id', 'name', 'address', 'city', 'phone', 'email']
          }
        ]
      });
    }

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

    // For admin/staff users, allow updating any court in their establishment
    const isAdmin = req.user.userType === 'admin';
    const isStaff = req.user.isStaff;
    
    let court;
    if (isAdmin) {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment'
        }]
      });
    } else if (isStaff) {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment',
          where: { id: req.user.establishmentId }
        }]
      });
    } else {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment',
          where: { userId: req.user.id }
        }]
      });
    }

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'Court not found or you do not have permission to update it'
      });
    }

    const { priceSchedules, ...updateData } = req.body;
    await court.update(updateData);

    // Update price schedules if provided
    if (priceSchedules && Array.isArray(priceSchedules)) {
      console.log('📋 Updating price schedules for court:', court.id);
      console.log('📋 Number of schedules to create:', priceSchedules.length);
      console.log('📋 Schedules data:', JSON.stringify(priceSchedules, null, 2));
      
      try {
        // Delete existing schedules
        const deletedCount = await CourtPriceSchedule.destroy({ where: { courtId: court.id } });
        console.log('🗑️  Deleted', deletedCount, 'existing schedules');
        
        // Create new schedules
        if (priceSchedules.length > 0) {
          for (const [index, schedule] of priceSchedules.entries()) {
            console.log(`➕ Creating schedule ${index + 1}:`, schedule);
            const created = await CourtPriceSchedule.create({
              courtId: court.id,
              name: schedule.name || `Franja ${index + 1}`,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              pricePerHour: parseFloat(schedule.pricePerHour) || 0,
              daysOfWeek: schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
              priority: schedule.priority || index,
              isActive: true
            });
            console.log('✅ Created schedule:', created.id);
          }
          console.log('✅ All price schedules created successfully');
        }
      } catch (scheduleError) {
        console.error('❌ Error updating price schedules:', scheduleError.message);
        console.error('❌ Stack trace:', scheduleError.stack);
        // Continue without failing - schedules table might not exist yet
      }
    } else {
      console.log('⚠️  No price schedules provided or invalid format');
    }

    // Fetch updated court with price schedules
    let updatedCourt;
    try {
      updatedCourt = await Court.findByPk(court.id, {
        include: [{ model: CourtPriceSchedule, as: 'priceSchedules' }]
      });
    } catch (e) {
      // Fallback without schedules if table doesn't exist
      updatedCourt = await Court.findByPk(court.id);
    }

    res.json({
      message: 'Court updated successfully',
      court: updatedCourt
    });

  } catch (error) {
    console.error('Update court error:', error.message, error.stack);
    res.status(500).json({
      error: 'Failed to update court',
      message: error.message || 'An error occurred while updating the court'
    });
  }
};

const deleteCourt = async (req, res) => {
  try {
    const { id } = req.params;

    // For admin/staff users, allow deleting any court in their establishment
    const isAdmin = req.user.userType === 'admin';
    const isStaff = req.user.isStaff;
    
    let court;
    if (isAdmin) {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment'
        }]
      });
    } else if (isStaff) {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment',
          where: { id: req.user.establishmentId }
        }]
      });
    } else {
      court = await Court.findOne({
        where: { id },
        include: [{
          model: Establishment,
          as: 'establishment',
          where: { userId: req.user.id }
        }]
      });
    }

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
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const openingHours = court.establishment?.openingHours?.[dayOfWeek];

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
  let closeMinutes = timeToMinutes(closeTime);
  
  // If close is before or equal to open, it crosses midnight (e.g. 08:00 - 01:30)
  if (closeMinutes <= openMinutes) {
    closeMinutes += 1440; // Add 24 hours
  }
  
  // Generate slots every 30 minutes
  for (let time = openMinutes; time + durationMinutes <= closeMinutes; time += 30) {
    const startTime = minutesToTime(time % 1440);
    const endTime = minutesToTime((time + durationMinutes) % 1440);
    
    // Check if slot conflicts with existing bookings
    const isBooked = bookings.some(booking => {
      let bookingStart = timeToMinutes(booking.startTime);
      let bookingEnd = timeToMinutes(booking.endTime);
      // Adjust booking times for post-midnight comparison
      if (closeMinutes > 1440) {
        if (bookingStart < openMinutes) bookingStart += 1440;
        if (bookingEnd <= openMinutes) bookingEnd += 1440;
      }
      return (time < bookingEnd && time + durationMinutes > bookingStart);
    });
    
    // Check if slot conflicts with blocked slots
    const isBlocked = blockedSlots.some(slot => {
      let slotStart = timeToMinutes(slot.startTime);
      let slotEnd = timeToMinutes(slot.endTime);
      // Adjust blocked slot times for post-midnight comparison
      if (closeMinutes > 1440) {
        if (slotStart < openMinutes) slotStart += 1440;
        if (slotEnd <= openMinutes) slotEnd += 1440;
      }
      return (time < slotEnd && time + durationMinutes > slotStart);
    });
    
    if (!isBooked && !isBlocked) {
      let price = parseFloat(court.pricePerHour) || 0;
      
      // Adjust price based on duration
      if (durationMinutes === 90 && court.pricePerHour90) {
        price = parseFloat(court.pricePerHour90);
      } else if (durationMinutes === 120 && court.pricePerHour120) {
        price = parseFloat(court.pricePerHour120);
      } else if (durationMinutes !== 60) {
        price = (price / 60) * durationMinutes;
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
