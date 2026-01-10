const { CourtPriceSchedule, Court, Establishment } = require('../models');
const { Op } = require('sequelize');

/**
 * Get all price schedules for a court
 */
const getCourtPriceSchedules = async (req, res) => {
  try {
    const { courtId } = req.params;

    const schedules = await CourtPriceSchedule.findAll({
      where: { courtId },
      order: [['startTime', 'ASC']]
    });

    res.json({
      success: true,
      data: schedules
    });
  } catch (error) {
    console.error('Error fetching price schedules:', error);
    res.status(500).json({
      error: 'Error fetching price schedules',
      message: error.message
    });
  }
};

/**
 * Create a new price schedule for a court
 */
const createPriceSchedule = async (req, res) => {
  try {
    const { courtId } = req.params;
    const { name, startTime, endTime, pricePerHour, daysOfWeek, priority } = req.body;

    // Validate court exists and user has access
    const court = await Court.findByPk(courtId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'La cancha no existe'
      });
    }

    // Check user permission
    const userId = req.user.id;
    const isOwner = court.establishment.userId === userId;
    const isAdmin = req.user.userType === 'admin' || req.user.userType === 'superadmin';
    const isStaff = req.user.isStaff && req.user.establishmentId === court.establishmentId;

    if (!isOwner && !isAdmin && !isStaff) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No tienes permiso para modificar esta cancha'
      });
    }

    // Validate times
    if (!name || !startTime || !endTime || !pricePerHour) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Nombre, hora inicio, hora fin y precio son requeridos'
      });
    }

    const schedule = await CourtPriceSchedule.create({
      courtId,
      name,
      startTime,
      endTime,
      pricePerHour,
      daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
      priority: priority || 0
    });

    res.status(201).json({
      success: true,
      message: 'Price schedule created',
      data: schedule
    });
  } catch (error) {
    console.error('Error creating price schedule:', error);
    res.status(500).json({
      error: 'Error creating price schedule',
      message: error.message
    });
  }
};

/**
 * Update a price schedule
 */
const updatePriceSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime, pricePerHour, daysOfWeek, priority, isActive } = req.body;

    const schedule = await CourtPriceSchedule.findByPk(id, {
      include: [{
        model: Court,
        as: 'court',
        include: [{ model: Establishment, as: 'establishment' }]
      }]
    });

    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found',
        message: 'La franja de precios no existe'
      });
    }

    // Check user permission
    const userId = req.user.id;
    const isOwner = schedule.court.establishment.userId === userId;
    const isAdmin = req.user.userType === 'admin' || req.user.userType === 'superadmin';
    const isStaff = req.user.isStaff && req.user.establishmentId === schedule.court.establishmentId;

    if (!isOwner && !isAdmin && !isStaff) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No tienes permiso para modificar esta franja'
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (pricePerHour !== undefined) updateData.pricePerHour = pricePerHour;
    if (daysOfWeek !== undefined) updateData.daysOfWeek = daysOfWeek;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    await schedule.update(updateData);

    res.json({
      success: true,
      message: 'Price schedule updated',
      data: schedule
    });
  } catch (error) {
    console.error('Error updating price schedule:', error);
    res.status(500).json({
      error: 'Error updating price schedule',
      message: error.message
    });
  }
};

/**
 * Delete a price schedule
 */
const deletePriceSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await CourtPriceSchedule.findByPk(id, {
      include: [{
        model: Court,
        as: 'court',
        include: [{ model: Establishment, as: 'establishment' }]
      }]
    });

    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found',
        message: 'La franja de precios no existe'
      });
    }

    // Check user permission
    const userId = req.user.id;
    const isOwner = schedule.court.establishment.userId === userId;
    const isAdmin = req.user.userType === 'admin' || req.user.userType === 'superadmin';
    const isStaff = req.user.isStaff && req.user.establishmentId === schedule.court.establishmentId;

    if (!isOwner && !isAdmin && !isStaff) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No tienes permiso para eliminar esta franja'
      });
    }

    await schedule.destroy();

    res.json({
      success: true,
      message: 'Price schedule deleted'
    });
  } catch (error) {
    console.error('Error deleting price schedule:', error);
    res.status(500).json({
      error: 'Error deleting price schedule',
      message: error.message
    });
  }
};

/**
 * Bulk update price schedules for a court (replace all)
 */
const bulkUpdatePriceSchedules = async (req, res) => {
  try {
    const { courtId } = req.params;
    const { schedules } = req.body;

    // Validate court exists and user has access
    const court = await Court.findByPk(courtId, {
      include: [{ model: Establishment, as: 'establishment' }]
    });

    if (!court) {
      return res.status(404).json({
        error: 'Court not found',
        message: 'La cancha no existe'
      });
    }

    // Check user permission
    const userId = req.user.id;
    const isOwner = court.establishment.userId === userId;
    const isAdmin = req.user.userType === 'admin' || req.user.userType === 'superadmin';
    const isStaff = req.user.isStaff && req.user.establishmentId === court.establishmentId;

    if (!isOwner && !isAdmin && !isStaff) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'No tienes permiso para modificar esta cancha'
      });
    }

    // Delete existing schedules
    await CourtPriceSchedule.destroy({ where: { courtId } });

    // Create new schedules
    const newSchedules = [];
    for (const schedule of schedules) {
      const created = await CourtPriceSchedule.create({
        courtId,
        name: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        pricePerHour: schedule.pricePerHour,
        daysOfWeek: schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
        priority: schedule.priority || 0
      });
      newSchedules.push(created);
    }

    res.json({
      success: true,
      message: 'Price schedules updated',
      data: newSchedules
    });
  } catch (error) {
    console.error('Error bulk updating price schedules:', error);
    res.status(500).json({
      error: 'Error updating price schedules',
      message: error.message
    });
  }
};

/**
 * Calculate price for a booking based on time ranges
 * This is a utility function that can be used by booking controller
 */
const calculateBookingPrice = async (courtId, startTime, endTime, bookingDate) => {
  try {
    // Get day of week (0 = Sunday, 6 = Saturday) in Argentina timezone (UTC-3)
    // Parse the date string as local date to avoid timezone issues
    const [year, month, day] = bookingDate.split('-').map(Number);
    const date = new Date(year, month - 1, day); // Create date in local timezone
    const dayOfWeek = date.getDay();

    // Get all active price schedules for this court that apply to this day
    const schedules = await CourtPriceSchedule.findAll({
      where: {
        courtId,
        isActive: true
      },
      order: [['priority', 'DESC'], ['startTime', 'ASC']]
    });

    // Filter schedules that apply to this day of week
    const applicableSchedules = schedules.filter(s => 
      s.daysOfWeek.includes(dayOfWeek)
    );

    if (applicableSchedules.length === 0) {
      // No schedules, use court's base price
      const court = await Court.findByPk(courtId);
      if (!court) return { totalPrice: 0, breakdown: [] };
      
      const durationMinutes = calculateMinutesBetween(startTime, endTime);
      const totalPrice = (court.pricePerHour / 60) * durationMinutes;
      
      return {
        totalPrice,
        breakdown: [{
          scheduleName: 'Precio base',
          startTime,
          endTime,
          minutes: durationMinutes,
          pricePerHour: parseFloat(court.pricePerHour),
          amount: totalPrice
        }]
      };
    }

    // Calculate price breakdown
    const breakdown = [];
    let totalPrice = 0;

    // Convert times to minutes for easier calculation
    const bookingStartMinutes = timeToMinutes(startTime);
    const bookingEndMinutes = timeToMinutes(endTime);

    // For each minute of the booking, find which schedule applies
    let currentMinute = bookingStartMinutes;
    
    while (currentMinute < bookingEndMinutes) {
      // Find the schedule that applies to this minute
      let appliedSchedule = null;
      
      for (const schedule of applicableSchedules) {
        const scheduleStart = timeToMinutes(schedule.startTime);
        const scheduleEnd = timeToMinutes(schedule.endTime);
        
        if (currentMinute >= scheduleStart && currentMinute < scheduleEnd) {
          appliedSchedule = schedule;
          break;
        }
      }

      if (appliedSchedule) {
        const scheduleEnd = timeToMinutes(appliedSchedule.endTime);
        const segmentEnd = Math.min(scheduleEnd, bookingEndMinutes);
        const segmentMinutes = segmentEnd - currentMinute;
        const segmentPrice = (parseFloat(appliedSchedule.pricePerHour) / 60) * segmentMinutes;

        // Add to breakdown or merge with existing
        const existingEntry = breakdown.find(b => b.scheduleId === appliedSchedule.id);
        if (existingEntry) {
          existingEntry.minutes += segmentMinutes;
          existingEntry.amount += segmentPrice;
        } else {
          breakdown.push({
            scheduleId: appliedSchedule.id,
            scheduleName: appliedSchedule.name,
            startTime: minutesToTime(currentMinute),
            endTime: minutesToTime(segmentEnd),
            minutes: segmentMinutes,
            pricePerHour: parseFloat(appliedSchedule.pricePerHour),
            amount: segmentPrice
          });
        }

        totalPrice += segmentPrice;
        currentMinute = segmentEnd;
      } else {
        // No schedule applies, use court base price for this segment
        const court = await Court.findByPk(courtId);
        const nextScheduleStart = findNextScheduleStart(currentMinute, applicableSchedules, bookingEndMinutes);
        const segmentEnd = Math.min(nextScheduleStart, bookingEndMinutes);
        const segmentMinutes = segmentEnd - currentMinute;
        const segmentPrice = (parseFloat(court.pricePerHour) / 60) * segmentMinutes;

        const existingEntry = breakdown.find(b => b.scheduleName === 'Precio base');
        if (existingEntry) {
          existingEntry.minutes += segmentMinutes;
          existingEntry.amount += segmentPrice;
        } else {
          breakdown.push({
            scheduleId: null,
            scheduleName: 'Precio base',
            startTime: minutesToTime(currentMinute),
            endTime: minutesToTime(segmentEnd),
            minutes: segmentMinutes,
            pricePerHour: parseFloat(court.pricePerHour),
            amount: segmentPrice
          });
        }

        totalPrice += segmentPrice;
        currentMinute = segmentEnd;
      }
    }

    return {
      totalPrice: Math.round(totalPrice),
      breakdown
    };
  } catch (error) {
    console.error('Error calculating booking price:', error);
    throw error;
  }
};

// Helper functions
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function calculateMinutesBetween(startTime, endTime) {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

function findNextScheduleStart(currentMinute, schedules, maxMinute) {
  let nextStart = maxMinute;
  for (const schedule of schedules) {
    const scheduleStart = timeToMinutes(schedule.startTime);
    if (scheduleStart > currentMinute && scheduleStart < nextStart) {
      nextStart = scheduleStart;
    }
  }
  return nextStart;
}

/**
 * API endpoint to calculate price for a booking
 */
const calculatePriceEndpoint = async (req, res) => {
  try {
    const { courtId } = req.params;
    const { startTime, endTime, date } = req.query;

    if (!startTime || !endTime || !date) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'startTime, endTime and date are required'
      });
    }

    const result = await calculateBookingPrice(courtId, startTime, endTime, date);

    // Return the result directly for frontend compatibility
    res.json(result);
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({
      error: 'Error calculating price',
      message: error.message
    });
  }
};

module.exports = {
  getCourtPriceSchedules,
  createPriceSchedule,
  updatePriceSchedule,
  deletePriceSchedule,
  bulkUpdatePriceSchedules,
  calculateBookingPrice,
  calculatePriceEndpoint
};
