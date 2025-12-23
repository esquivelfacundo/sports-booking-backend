/**
 * Booking Scheduler Service
 * Handles automatic status updates for bookings
 */

const { Booking } = require('../models');
const { Op } = require('sequelize');

// Argentina timezone offset (UTC-3)
const ARGENTINA_OFFSET = -3;

/**
 * Get current time in Argentina timezone
 * Returns an object with the date string (YYYY-MM-DD), hours, and minutes
 * to avoid timezone conversion issues with toISOString()
 */
const getArgentinaTime = () => {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const argentinaDate = new Date(utcTime + (ARGENTINA_OFFSET * 3600000));
  
  // Extract date components directly to avoid toISOString() UTC conversion
  const year = argentinaDate.getFullYear();
  const month = String(argentinaDate.getMonth() + 1).padStart(2, '0');
  const day = String(argentinaDate.getDate()).padStart(2, '0');
  const hours = argentinaDate.getHours();
  const minutes = argentinaDate.getMinutes();
  
  return {
    date: argentinaDate,
    dateString: `${year}-${month}-${day}`,
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes
  };
};

/**
 * Mark pending/confirmed bookings as no_show if they haven't been started (in_progress)
 * 30 minutes after their start time.
 * IMPORTANT: Only marks bookings from TODAY that have ALREADY STARTED + 30 min passed.
 * Never marks future bookings or bookings from other days.
 */
const markNoShowBookings = async () => {
  try {
    const argentinaTime = getArgentinaTime();
    const today = argentinaTime.dateString;
    const currentHours = argentinaTime.hours;
    const currentMinutes = argentinaTime.minutes;
    const currentTotalMinutes = argentinaTime.totalMinutes;
    
    console.log(`[BookingScheduler] Running no-show check at ${currentHours}:${String(currentMinutes).padStart(2, '0')} Argentina time (${today})`);
    
    // Find all pending or confirmed bookings for today (not started yet)
    const bookings = await Booking.findAll({
      where: {
        date: today,
        status: { [Op.in]: ['pending', 'confirmed'] }
      }
    });
    
    let updatedCount = 0;
    
    for (const booking of bookings) {
      // Parse booking start time
      const [hours, minutes] = booking.startTime.split(':').map(Number);
      const bookingStartMinutes = hours * 60 + minutes;
      
      // Calculate minutes since booking started
      // Positive = booking already started, Negative = booking hasn't started yet
      const minutesSinceStart = currentTotalMinutes - bookingStartMinutes;
      
      // SAFETY CHECK: Only mark as no_show if:
      // 1. The booking has actually started (minutesSinceStart > 0)
      // 2. At least 30 minutes have passed since start
      if (minutesSinceStart >= 30) {
        await booking.update({ status: 'no_show' });
        updatedCount++;
        console.log(`[BookingScheduler] Marked booking ${booking.id} as no_show (started at ${booking.startTime}, ${minutesSinceStart} min ago)`);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[BookingScheduler] Marked ${updatedCount} bookings as no_show`);
    }
    
    return updatedCount;
  } catch (error) {
    console.error('[BookingScheduler] Error marking no-show bookings:', error);
    return 0;
  }
};

/**
 * Mark in_progress bookings as completed if 30 minutes have passed after their end time.
 * This auto-completes bookings that the establishment staff forgot to mark as completed.
 * DISABLED: Now requires cash register to be open to complete orders.
 */
const markCompletedBookings = async () => {
  // DISABLED: Auto-completion disabled because cash register system requires manual completion
  console.log('[BookingScheduler] Auto-completion of bookings is disabled (cash register system active)');
  return 0;
  
  /* ORIGINAL CODE - DISABLED
  try {
    const argentinaTime = getArgentinaTime();
    const today = argentinaTime.toISOString().split('T')[0];
    const currentHours = argentinaTime.getHours();
    const currentMinutes = argentinaTime.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    
    // Find all in_progress bookings for today
    const bookings = await Booking.findAll({
      where: {
        date: today,
        status: 'in_progress'
      }
    });
    
    let updatedCount = 0;
    
    for (const booking of bookings) {
      // Parse booking end time
      const [hours, minutes] = booking.endTime.split(':').map(Number);
      const bookingEndMinutes = hours * 60 + minutes;
      
      // Calculate minutes since booking ended
      // Positive = booking already ended, Negative = booking hasn't ended yet
      const minutesSinceEnd = currentTotalMinutes - bookingEndMinutes;
      
      // Mark as completed if 30 minutes have passed since end time
      if (minutesSinceEnd >= 30) {
        await booking.update({ 
          status: 'completed',
          completedAt: new Date()
        });
        updatedCount++;
        console.log(`[BookingScheduler] Marked booking ${booking.id} as completed (ended at ${booking.endTime}, ${minutesSinceEnd} min ago)`);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[BookingScheduler] Marked ${updatedCount} bookings as completed`);
    }
    
    return updatedCount;
  } catch (error) {
    console.error('[BookingScheduler] Error marking completed bookings:', error);
    return 0;
  }
  */
};

/**
 * Run all scheduled booking checks
 */
const runScheduledChecks = async () => {
  await markNoShowBookings();
  await markCompletedBookings();
};

/**
 * Start the scheduler - runs every 5 minutes
 */
const startScheduler = () => {
  console.log('[BookingScheduler] Starting booking scheduler...');
  
  // Run immediately on startup
  runScheduledChecks();
  
  // Then run every 5 minutes
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  setInterval(runScheduledChecks, intervalMs);
  
  console.log('[BookingScheduler] Scheduler started - checking every 5 minutes');
};

module.exports = {
  markNoShowBookings,
  markCompletedBookings,
  startScheduler,
  getArgentinaTime
};
