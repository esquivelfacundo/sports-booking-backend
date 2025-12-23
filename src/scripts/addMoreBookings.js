/**
 * Script to add more bookings for Club Juventus
 * Adds bookings from December 1-28, 2025
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { Booking, Court, Establishment, User, Client } = require('../models');
const { Op } = require('sequelize');

// Client names for realistic data
const clientNames = [
  'Martín González', 'Lucía Fernández', 'Carlos Rodríguez', 'María López',
  'Juan Pérez', 'Ana García', 'Diego Martínez', 'Sofía Sánchez',
  'Pablo Díaz', 'Valentina Romero', 'Nicolás Acosta', 'Camila Flores',
  'Sebastián Torres', 'Isabella Moreno', 'Matías Ruiz', 'Emma Romero',
  'Agustín Molina', 'Julieta Acosta', 'Tomás Herrera', 'Delfina Ríos'
];

async function addMoreBookings() {
  console.log('========================================');
  console.log('Adding more bookings for Club Juventus');
  console.log('========================================\n');

  try {
    // Find Juventus establishment
    const establishment = await Establishment.findOne({
      where: { name: { [Op.like]: '%Juventus%' } }
    });

    if (!establishment) {
      console.error('❌ Club Juventus not found!');
      process.exit(1);
    }

    console.log('✅ Found establishment:', establishment.name);

    // Get admin user
    const adminUser = await User.findOne({
      where: { email: 'juventus@miscanchas.com' }
    });

    if (!adminUser) {
      console.error('❌ Admin user not found!');
      process.exit(1);
    }

    // Get courts
    const courts = await Court.findAll({
      where: { establishmentId: establishment.id }
    });

    console.log(`✅ Found ${courts.length} courts`);

    // Get clients
    const clients = await Client.findAll({
      where: { establishmentId: establishment.id }
    });

    console.log(`✅ Found ${clients.length} clients`);

    // Time slots (8:00 to 23:00)
    const timeSlots = [];
    for (let hour = 8; hour < 23; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    let bookingsCreated = 0;
    let skipped = 0;

    // Generate bookings for December 1-28, 2025
    for (let day = 1; day <= 28; day++) {
      const dateStr = `2025-12-${day.toString().padStart(2, '0')}`;
      
      for (const court of courts) {
        // Randomly select time slots for this day (40-60% occupancy)
        const occupancyRate = 0.4 + Math.random() * 0.2;
        const slotsToBook = Math.floor(timeSlots.length * occupancyRate);
        
        // Shuffle and pick slots
        const shuffledSlots = [...timeSlots].sort(() => Math.random() - 0.5);
        const selectedSlots = shuffledSlots.slice(0, slotsToBook);
        
        for (const time of selectedSlots) {
          // Check if booking already exists
          const existing = await Booking.findOne({
            where: {
              courtId: court.id,
              date: dateStr,
              startTime: time
            }
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Random duration (60, 90, or 120 min)
          const durations = [60, 60, 60, 90, 120]; // More 60 min bookings
          const duration = durations[Math.floor(Math.random() * durations.length)];
          
          // Calculate end time
          const [hours, mins] = time.split(':').map(Number);
          const endMinutes = hours * 60 + mins + duration;
          const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
          
          // Skip if end time is after 23:00
          if (endMinutes > 23 * 60) continue;
          
          // Random client
          const client = clients[Math.floor(Math.random() * clients.length)];
          
          // Calculate price
          let price = parseFloat(court.pricePerHour);
          if (duration === 90) price = court.pricePerHour90 ? parseFloat(court.pricePerHour90) : price * 1.4;
          if (duration === 120) price = court.pricePerHour120 ? parseFloat(court.pricePerHour120) : price * 1.8;
          
          // Status based on date
          const today = new Date();
          const bookingDate = new Date(dateStr);
          let status = 'confirmed';
          let paymentStatus = 'pending';
          
          if (bookingDate < today) {
            status = Math.random() < 0.9 ? 'completed' : 'cancelled';
            paymentStatus = status === 'completed' ? 'completed' : 'pending';
          } else {
            status = Math.random() < 0.8 ? 'confirmed' : 'pending';
            paymentStatus = Math.random() < 0.5 ? 'completed' : 'pending';
          }
          
          // Some are recurring
          const isRecurring = Math.random() < 0.15;
          
          try {
            await Booking.create({
              id: uuidv4(),
              userId: adminUser.id,
              establishmentId: establishment.id,
              courtId: court.id,
              date: dateStr,
              startTime: time,
              endTime: endTime,
              duration,
              totalAmount: price,
              status,
              paymentStatus,
              clientName: client.name,
              clientPhone: client.phone,
              clientEmail: client.email,
              isRecurring,
              bookingType: isRecurring ? 'abonado' : 'normal',
              notes: isRecurring ? 'Turno fijo semanal' : null
            });
            
            bookingsCreated++;
            
            // Update client stats
            await Client.increment('totalBookings', { where: { id: client.id } });
            
          } catch (err) {
            console.error(`Error creating booking: ${err.message}`);
          }
        }
      }
      
      if (day % 7 === 0) {
        console.log(`📅 Processed ${day} days, ${bookingsCreated} bookings created...`);
      }
    }

    console.log('\n========================================');
    console.log('🎉 COMPLETED!');
    console.log('========================================');
    console.log(`✅ Created ${bookingsCreated} new bookings`);
    console.log(`ℹ️ Skipped ${skipped} existing slots`);
    console.log('========================================');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

addMoreBookings();
