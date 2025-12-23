/**
 * Script to remove overlapping bookings from the database
 * Keeps the first booking (by createdAt) and removes duplicates that overlap
 */

require('dotenv').config();
const { Sequelize, Op } = require('sequelize');

// Database connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: process.env.NODE_ENV === 'production' ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {}
});

async function removeOverlappingBookings() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Get all bookings ordered by court, date, and createdAt
    const [bookings] = await sequelize.query(`
      SELECT id, "courtId", date, "startTime", "endTime", "clientName", "createdAt", status
      FROM bookings
      WHERE status != 'cancelled'
      ORDER BY "courtId", date, "startTime", "createdAt"
    `);

    console.log(`📊 Total active bookings: ${bookings.length}`);

    // Group bookings by court and date
    const groupedBookings = {};
    for (const booking of bookings) {
      const key = `${booking.courtId}_${booking.date}`;
      if (!groupedBookings[key]) {
        groupedBookings[key] = [];
      }
      groupedBookings[key].push(booking);
    }

    // Helper function to convert time string to minutes
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Find overlapping bookings
    const bookingsToDelete = [];

    for (const key of Object.keys(groupedBookings)) {
      const dayBookings = groupedBookings[key];
      
      // Sort by startTime, then by createdAt (keep oldest)
      dayBookings.sort((a, b) => {
        const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        if (startDiff !== 0) return startDiff;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      // Track occupied time slots
      const keptBookings = [];

      for (const booking of dayBookings) {
        const bookingStart = timeToMinutes(booking.startTime);
        const bookingEnd = timeToMinutes(booking.endTime);

        // Check if this booking overlaps with any kept booking
        let overlaps = false;
        for (const kept of keptBookings) {
          const keptStart = timeToMinutes(kept.startTime);
          const keptEnd = timeToMinutes(kept.endTime);

          // Check for overlap: booking starts before kept ends AND booking ends after kept starts
          if (bookingStart < keptEnd && bookingEnd > keptStart) {
            overlaps = true;
            console.log(`⚠️  Overlap found on ${booking.date}:`);
            console.log(`   Keeping: ${kept.startTime}-${kept.endTime} (${kept.clientName || 'N/A'})`);
            console.log(`   Removing: ${booking.startTime}-${booking.endTime} (${booking.clientName || 'N/A'})`);
            break;
          }
        }

        if (overlaps) {
          bookingsToDelete.push(booking.id);
        } else {
          keptBookings.push(booking);
        }
      }
    }

    console.log(`\n🗑️  Bookings to delete: ${bookingsToDelete.length}`);

    if (bookingsToDelete.length > 0) {
      // Delete overlapping bookings
      const [, deleteResult] = await sequelize.query(`
        DELETE FROM bookings
        WHERE id IN (:ids)
      `, {
        replacements: { ids: bookingsToDelete }
      });

      console.log(`✅ Deleted ${bookingsToDelete.length} overlapping bookings`);
    } else {
      console.log('✅ No overlapping bookings found');
    }

    // Verify final count
    const [[{ count }]] = await sequelize.query(`
      SELECT COUNT(*) as count FROM bookings WHERE status != 'cancelled'
    `);
    console.log(`📊 Remaining active bookings: ${count}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    console.log('🔌 Database connection closed');
  }
}

removeOverlappingBookings();
